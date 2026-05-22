import { NextRequest, NextResponse } from "next/server";
import { getAircraftMeta } from "@/lib/db/flightLogDb";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ icao24: string }> }
) {
  const { icao24 } = await params;
  let meta;
  try {
    meta = await getAircraftMeta(icao24.toLowerCase());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "db error" },
      { status: 500, headers: NO_CACHE }
    );
  }
  if (!meta) {
    return NextResponse.json(null, { headers: NO_CACHE });
  }
  return NextResponse.json(meta, { headers: NO_CACHE });
}
