import { NextRequest, NextResponse } from "next/server";
import { getRoutesByCallsign } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 20, 60_000);
  if (reject) return reject;
  const sp = req.nextUrl.searchParams;
  const daysBack = Math.min(
    Math.max(parseFloat(sp.get("days") ?? "30"), 1),
    365
  );
  const minPoints = Math.max(parseInt(sp.get("minPoints") ?? "10", 10), 3);

  const toMs = Date.now();
  const fromMs = toMs - daysBack * 86_400_000;

  let routes;
  try {
    routes = await getRoutesByCallsign(fromMs, toMs, minPoints);
  } catch (e) {
    console.error("[flight-log/routes]", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_CACHE }
    );
  }

  // Return as GeoJSON FeatureCollection with one LineString per callsign.
  // Multiple historical passes for the same callsign are included as separate
  // features — overlapping semi-transparent lines on the map give a natural
  // "density / average route" appearance without server-side smoothing.
  const features = routes.map((r) => ({
    type: "Feature" as const,
    properties: {
      callsign: r.callsign,
      pointCount: r.points.length,
    },
    geometry: {
      type: "LineString" as const,
      coordinates: r.points.map((p) => [p.lng, p.lat, p.alt_baro_m ?? 0]),
    },
  }));

  return NextResponse.json(
    {
      type: "FeatureCollection",
      features,
      meta: { routes: routes.length, daysBack, fromMs, toMs },
    },
    { headers: NO_CACHE }
  );
}
