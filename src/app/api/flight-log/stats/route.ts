import { NextResponse } from "next/server";
import { getStats } from "@/lib/db/flightLogDb";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET() {
  let stats;
  try {
    stats = await getStats();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "db error" },
      { status: 500, headers: NO_CACHE }
    );
  }
  return NextResponse.json(stats, { headers: NO_CACHE });
}
