import { NextRequest, NextResponse } from "next/server";
import { getHeatmapCells, type HeatmapHourFilter } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

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

  return NextResponse.json(
    {
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
    },
    { headers: NO_CACHE }
  );
}
