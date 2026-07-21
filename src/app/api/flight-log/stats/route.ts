import { NextResponse } from "next/server";
import { dbVersionKey, getStats } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json" };

// Same memoization as flight-log/routes: full-table COUNT scans whose result
// only changes when the writer flushes the DB file. No params, so a single
// entry suffices; the TTL bounds the last24h drift between flushes.
const bodyCache = createTtlBodyCache(5 * 60_000, 2);

export async function GET(req: Request) {
  const reject = rejectIfRateLimited(req, 30, 60_000, "flight-log/stats");
  if (reject) return reject;

  const cacheKey = dbVersionKey();
  const cached = bodyCache.get(cacheKey);
  if (cached) return new NextResponse(cached, { headers: JSON_HEADERS });

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
  const body = JSON.stringify(stats);
  bodyCache.set(cacheKey, body);
  return new NextResponse(body, { headers: JSON_HEADERS });
}
