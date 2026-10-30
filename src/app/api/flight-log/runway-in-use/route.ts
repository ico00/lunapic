import { NextResponse } from "next/server";
import { getRunwayUseSamples } from "@/lib/db/flightLogDb";
import { detectRunwayInUse, RUNWAY_IN_USE_WINDOW_MS } from "@/lib/domain/geometry/runwayInUse";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json" };

/** The log gains a fix every ~15 s, so a minute costs nothing here and saves the query. */
const bodyCache = createTtlBodyCache(60_000, 1);
const CACHE_KEY = "latest";

export async function GET(req: Request) {
  const reject = rejectIfRateLimited(req, 30, 60_000, "flight-log/runway-in-use");
  if (reject) return reject;

  const cached = bodyCache.get(CACHE_KEY);
  if (cached) return new NextResponse(cached, { headers: JSON_HEADERS });

  try {
    const nowMs = Date.now();
    const samples = await getRunwayUseSamples(nowMs - RUNWAY_IN_USE_WINDOW_MS, nowMs);
    const body = JSON.stringify(detectRunwayInUse(samples, nowMs));
    bodyCache.set(CACHE_KEY, body);
    return new NextResponse(body, { headers: JSON_HEADERS });
  } catch (e) {
    console.error("[flight-log/runway-in-use]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_CACHE });
  }
}
