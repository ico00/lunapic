import { NextRequest, NextResponse } from "next/server";
import { dbVersionKey, getAllCallsignSessions, type RoutePoint } from "@/lib/db/flightLogDb";
import { forecastPhotoSpots } from "@/lib/domain/flightlog/photoSpotForecast";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json" };
const DAY_MS = 86_400_000;

const bodyCache = createTtlBodyCache(15 * 60_000, 8);

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 10, 60_000, "flight-log/photo-spots");
  if (reject) return reject;

  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") ?? "");
  const lng = parseFloat(sp.get("lng") ?? "");
  const heightM = parseFloat(sp.get("heightM") ?? "0");
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Invalid observer" }, { status: 400, headers: NO_CACHE });
  }
  const groundHeightMeters = isFinite(heightM) ? heightM : 0;

  const historyDays = Math.min(Math.max(parseFloat(sp.get("historyDays") ?? "30"), 1), 90);
  const forecastDays = Math.min(Math.max(parseFloat(sp.get("forecastDays") ?? "14"), 1), 30);
  /** How far the photographer is willing to travel. */
  const maxSpotKm = Math.min(Math.max(parseFloat(sp.get("maxSpotKm") ?? "25"), 0.5), 100);
  // A floor only — nothing filters coverage from above. An aircraft wider than
  // the Moon is a wanted result (low approach traffic clears 150 % routinely),
  // so the upper clamp exists to bound the *query*, not the answers.
  const minCoveragePercent = Math.min(
    Math.max(parseFloat(sp.get("minCoveragePercent") ?? "25"), 1),
    200
  );
  /**
   * Historical scatter above which a "spot" stops being a spot. The transit
   * tolerance is ~100 m across; a callsign whose own track wanders kilometres
   * between passes cannot be aimed at, however good the geometry looks.
   */
  const maxSpreadM =
    Math.min(Math.max(parseFloat(sp.get("maxSpreadKm") ?? "2.5"), 0.1), 20) * 1000;

  const cacheKey = [
    dbVersionKey(),
    lat.toFixed(3),
    lng.toFixed(3),
    groundHeightMeters,
    historyDays,
    forecastDays,
    maxSpotKm,
    minCoveragePercent,
    maxSpreadM,
  ].join("|");
  const cached = bodyCache.get(cacheKey);
  if (cached) return new NextResponse(cached, { headers: JSON_HEADERS });

  const nowMs = Date.now();
  const fromMs = nowMs - historyDays * DAY_MS;
  const toMs = nowMs + forecastDays * DAY_MS;

  let sessionsByCallsign: Map<string, RoutePoint[][]>;
  try {
    sessionsByCallsign = await getAllCallsignSessions(fromMs, nowMs);
  } catch (e) {
    console.error("[flight-log/photo-spots]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_CACHE });
  }

  const forecast = await forecastPhotoSpots(sessionsByCallsign, {
    observer: { lat, lng, groundHeightMeters },
    nowMs,
    toMs,
    maxSpotM: maxSpotKm * 1000,
    minCoveragePercent,
    maxSpreadM,
  });

  const body = JSON.stringify({
    ...forecast,
    historyDays,
    forecastDays,
    maxSpotKm,
    minCoveragePercent,
    maxSpreadKm: maxSpreadM / 1000,
  });
  bodyCache.set(cacheKey, body);
  return new NextResponse(body, { headers: JSON_HEADERS });
}
