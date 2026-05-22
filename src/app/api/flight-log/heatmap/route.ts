import { NextRequest, NextResponse } from "next/server";
import { getHeatmapCells } from "@/lib/db/flightLogDb";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
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

  let cells;
  try {
    cells = await getHeatmapCells(fromMs, resolution);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "db error" },
      { status: 500, headers: NO_CACHE }
    );
  }

  const maxCount = cells.length > 0 ? Math.max(...cells.map((c) => c.count)) : 1;

  const features = cells.map((c) => ({
    type: "Feature" as const,
    properties: {
      count: c.count,
      weight: c.count / maxCount,
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
      meta: { cells: cells.length, daysBack, resolution, fromMs },
    },
    { headers: NO_CACHE }
  );
}
