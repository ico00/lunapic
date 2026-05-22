import { NextRequest, NextResponse } from "next/server";
import { getTrack } from "@/lib/db/flightLogDb";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const NOW = Date.now;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ icao24: string }> }
) {
  const { icao24 } = await params;
  const sp = req.nextUrl.searchParams;

  const hoursBack = Math.min(
    Math.max(parseFloat(sp.get("hours") ?? "24"), 0.5),
    168
  );
  const toMs = NOW();
  const fromMs = toMs - hoursBack * 3_600_000;

  let rows;
  try {
    rows = await getTrack(icao24.toLowerCase(), fromMs, toMs);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "db error" },
      { status: 500, headers: NO_CACHE }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { headers: NO_CACHE }
    );
  }

  const coords = rows.map((r) => [r.lng, r.lat, r.alt_baro_m ?? 0]);
  return NextResponse.json(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            icao24,
            count: rows.length,
            fromMs,
            toMs,
          },
          geometry: {
            type: "LineString",
            coordinates: coords,
          },
        },
      ],
    },
    { headers: NO_CACHE }
  );
}
