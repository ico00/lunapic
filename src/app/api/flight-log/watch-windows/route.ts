import { NextRequest, NextResponse } from "next/server";
import { dbVersionKey, getAllCallsignSessions, type RoutePoint } from "@/lib/db/flightLogDb";
import {
  buildSkyDensity,
  mergeWatchWindows,
  summarizeWatchSlots,
  WATCH_HISTORY_DAYS,
  watchSlots,
} from "@/lib/domain/flightlog/watchWindows";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json" };
const DAY_MS = 86_400_000;
const FORECAST_DAYS = 14;

const bodyCache = createTtlBodyCache(15 * 60_000, 8);

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 10, 60_000, "flight-log/watch-windows");
  if (reject) return reject;

  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") ?? "");
  const lng = parseFloat(sp.get("lng") ?? "");
  const heightM = parseFloat(sp.get("heightM") ?? "0");
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Invalid observer" }, { status: 400, headers: NO_CACHE });
  }
  const observer = { lat, lng, groundHeightMeters: isFinite(heightM) ? heightM : 0 };

  const cacheKey = `${dbVersionKey()}|${lat.toFixed(3)}|${lng.toFixed(3)}|${heightM}`;
  const cached = bodyCache.get(cacheKey);
  if (cached) return new NextResponse(cached, { headers: JSON_HEADERS });

  const nowMs = Date.now();
  let sessionsByCallsign: Map<string, RoutePoint[][]>;
  try {
    sessionsByCallsign = await getAllCallsignSessions(nowMs - WATCH_HISTORY_DAYS * DAY_MS, nowMs);
  } catch (e) {
    console.error("[flight-log/watch-windows]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_CACHE });
  }

  const density = await buildSkyDensity(sessionsByCallsign, observer);
  const slots = watchSlots(density, { observer, nowMs, toMs: nowMs + FORECAST_DAYS * DAY_MS });

  const body = JSON.stringify({
    windows: mergeWatchWindows(slots),
    summary: summarizeWatchSlots(slots),
    historyDays: WATCH_HISTORY_DAYS,
    forecastDays: FORECAST_DAYS,
  });
  bodyCache.set(cacheKey, body);
  return new NextResponse(body, { headers: JSON_HEADERS });
}
