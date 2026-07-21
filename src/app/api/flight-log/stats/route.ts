import { NextResponse } from "next/server";
import { getStats } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const reject = rejectIfRateLimited(req, 30, 60_000, "flight-log/stats");
  if (reject) return reject;
  let stats;
  try {
    stats = await getStats();
  } catch (e) {
    console.error("[flight-log/stats]", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_CACHE }
    );
  }
  return NextResponse.json(stats, { headers: NO_CACHE });
}
