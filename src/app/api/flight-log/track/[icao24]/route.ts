import { NextRequest, NextResponse } from "next/server";
import { getTrack } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const NOW = Date.now;
/**
 * Logging cadence is ~15s (see server.js poller). A gap this much larger than
 * that means the receiver actually lost the aircraft (out of range, behind
 * terrain, landed-then-relaunched under the same icao24) rather than a single
 * missed tick. Without this, one LineString silently bridges the last point
 * before the gap straight to the first point after it — a straight line across
 * the map with no relation to any real flight path. Matches the EVENT_GAP_MS
 * precedent in transit-history/route.ts.
 */
const TRAIL_GAP_MS = 5 * 60_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ icao24: string }> }
) {
  const reject = rejectIfRateLimited(req, 30, 60_000, "flight-log/track");
  if (reject) return reject;
  const { icao24 } = await params;
  if (!/^[0-9a-f]{1,8}$/i.test(icao24)) {
    return NextResponse.json({ error: "Invalid icao24" }, { status: 400, headers: NO_CACHE });
  }
  const sp = req.nextUrl.searchParams;

  const hoursBack = Math.min(
    Math.max(parseFloat(sp.get("hours") ?? "24"), 0.5),
    720
  );
  const toMs = NOW();
  const fromMs = toMs - hoursBack * 3_600_000;

  let rows;
  try {
    rows = await getTrack(icao24.toLowerCase(), fromMs, toMs);
  } catch (e) {
    console.error("[flight-log/track]", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_CACHE }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { headers: NO_CACHE }
    );
  }

  const segments: (typeof rows)[number][][] = [];
  let current: (typeof rows)[number][] = [];
  for (const row of rows) {
    const prev = current[current.length - 1];
    if (prev && row.logged_at - prev.logged_at > TRAIL_GAP_MS) {
      segments.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length > 0) segments.push(current);

  const features = segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => ({
      type: "Feature" as const,
      properties: {
        icao24,
        count: segment.length,
        fromMs: segment[0]!.logged_at,
        toMs: segment[segment.length - 1]!.logged_at,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: segment.map((r) => [r.lng, r.lat, r.alt_baro_m ?? 0]),
      },
    }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: NO_CACHE }
  );
}
