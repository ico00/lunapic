import { NextRequest, NextResponse } from "next/server";
import { dbVersionKey, getHeatmapCells, type HeatmapHourFilter } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json" };

// Same memoization as flight-log/routes: the GROUP BY over the whole window is
// the cost, the result only changes when the writer flushes the DB file, and
// every map client polls on a 5-min timer. Keyed per (db version, params);
// hour-filter variants get their own entries.
const bodyCache = createTtlBodyCache(5 * 60_000, 16);

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 20, 60_000, "flight-log/heatmap");
  if (reject) return reject;
  const sp = req.nextUrl.searchParams;
  const daysBack = Math.min(
    Math.max(parseFloat(sp.get("days") ?? "7"), 0.5),
    90
  );
  const resolution = Math.min(
    Math.max(parseFloat(sp.get("res") ?? "0.05"), 0.01),
    1.0
  );

  const fromMs = Date.now() - daysBack * 86_400_000;

  // Optional hour-of-day window (viewer-local). Both bounds must be present.
  let hourFilter: HeatmapHourFilter | undefined;
  const fromHourRaw = sp.get("hourFrom");
  const toHourRaw = sp.get("hourTo");
  if (fromHourRaw !== null && toHourRaw !== null) {
    const fromHour = parseInt(fromHourRaw, 10);
    const toHour = parseInt(toHourRaw, 10);
    const tzOffMin = parseInt(sp.get("tzOffMin") ?? "0", 10);
    if (
      Number.isInteger(fromHour) && fromHour >= 0 && fromHour <= 23 &&
      Number.isInteger(toHour) && toHour >= 0 && toHour <= 23 &&
      Number.isInteger(tzOffMin) && Math.abs(tzOffMin) <= 14 * 60
    ) {
      hourFilter = { fromHour, toHour, tzOffsetMs: tzOffMin * 60_000 };
    }
  }

  const cacheKey = `${dbVersionKey()}|${daysBack}|${resolution}|${
    hourFilter ? `${hourFilter.fromHour}-${hourFilter.toHour}-${hourFilter.tzOffsetMs}` : "all"
  }`;
  const cached = bodyCache.get(cacheKey);
  if (cached) return new NextResponse(cached, { headers: JSON_HEADERS });

  let cells;
  try {
    cells = await getHeatmapCells(fromMs, resolution, hourFilter);
  } catch (e) {
    console.error("[flight-log/heatmap]", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_CACHE }
    );
  }

  // Log-scaled weight: over a long window nearly every cell has been visited, so
  // a linear count/max washes the map into a uniform grid. log(1+count) keeps
  // busy corridors clearly above the sparse background instead of saturating.
  const maxLog = cells.length > 0
    ? Math.max(...cells.map((c) => Math.log1p(c.count)))
    : 1;

  const features = cells.map((c) => ({
    type: "Feature" as const,
    properties: {
      count: c.count,
      weight: maxLog > 0 ? Math.log1p(c.count) / maxLog : 0,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [c.lng, c.lat],
    },
  }));

  const body = JSON.stringify({
    type: "FeatureCollection",
    features,
    meta: {
      cells: cells.length,
      daysBack,
      resolution,
      fromMs,
      hourFrom: hourFilter?.fromHour ?? null,
      hourTo: hourFilter?.toHour ?? null,
    },
  });
  bodyCache.set(cacheKey, body);
  return new NextResponse(body, { headers: JSON_HEADERS });
}
