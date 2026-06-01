import { NextRequest, NextResponse } from "next/server";
import { getAircraftMeta } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ icao24: string }> }
) {
  const reject = rejectIfRateLimited(req, 30, 60_000);
  if (reject) return reject;
  const { icao24 } = await params;
  if (!/^[0-9a-f]{1,8}$/i.test(icao24)) {
    return NextResponse.json({ error: "Invalid icao24" }, { status: 400, headers: NO_CACHE });
  }
  let meta;
  try {
    meta = await getAircraftMeta(icao24.toLowerCase());
  } catch (e) {
    console.error("[flight-log/aircraft]", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_CACHE }
    );
  }
  if (!meta) {
    return NextResponse.json(null, { headers: NO_CACHE });
  }
  return NextResponse.json(meta, { headers: NO_CACHE });
}
