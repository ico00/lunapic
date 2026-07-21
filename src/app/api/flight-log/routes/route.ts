import { NextRequest, NextResponse } from "next/server";
import { getRoutesByCallsign } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 20, 60_000, "flight-log/routes");
  if (reject) return reject;
  const sp = req.nextUrl.searchParams;
  const daysBack = Math.min(
    Math.max(parseFloat(sp.get("days") ?? "7"), 1),
    365
  );
  const minPoints = Math.max(parseInt(sp.get("minPoints") ?? "10", 10), 3);
  const maxRoutes = Math.min(
    Math.max(parseInt(sp.get("maxRoutes") ?? "2000", 10), 100),
    20_000
  );

  const toMs = Date.now();
  const fromMs = toMs - daysBack * 86_400_000;

  let routes;
  try {
    routes = await getRoutesByCallsign(fromMs, toMs, minPoints, 150, maxRoutes);
  } catch (e) {
    console.error("[flight-log/routes]", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_CACHE }
    );
  }

  // Return as GeoJSON FeatureCollection with one LineString per *pass* — the
  // same callsign flying on different days yields separate features (see
  // getRoutesByCallsign). Overlapping semi-transparent lines then give a
  // natural "density / average route" look without server-side smoothing.
  const features = routes.map((r) => {
    const alts = r.points
      .map((p) => p.alt_baro_m)
      .filter((a): a is number => a != null)
      .sort((a, b) => a - b);
    const medianAltM = alts.length > 0 ? Math.round(alts[Math.floor(alts.length / 2)]) : null;
    return {
      type: "Feature" as const,
      properties: {
        callsign: r.callsign,
        pointCount: r.points.length,
        // Median altitude over the observer area — drives corridor colouring
        // (low = approach/descent = larger apparent aircraft).
        medianAltM,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: r.points.map((p) => [p.lng, p.lat, p.alt_baro_m ?? 0]),
      },
    };
  });

  return NextResponse.json(
    {
      type: "FeatureCollection",
      features,
      meta: { routes: routes.length, daysBack, fromMs, toMs },
    },
    { headers: NO_CACHE }
  );
}
