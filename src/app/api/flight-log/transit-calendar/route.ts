import { NextRequest, NextResponse } from "next/server";
import { dbVersionKey, getAllCallsignSessions, type RoutePoint } from "@/lib/db/flightLogDb";
import { forecastTransitCalendar } from "@/lib/domain/flightlog/transitCalendarForecast";
import {
  CAMERA_SENSOR_CROP,
  horizontalFovDeg,
  verticalFovDeg,
  type CameraSensorType,
} from "@/lib/domain/geometry/shotFeasibility";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json" };
const DAY_MS = 86_400_000;

const bodyCache = createTtlBodyCache(15 * 60_000, 8);

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 10, 60_000, "flight-log/transit-calendar");
  if (reject) return reject;

  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") ?? "");
  const lng = parseFloat(sp.get("lng") ?? "");
  const heightM = parseFloat(sp.get("heightM") ?? "0");
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Invalid observer" }, { status: 400, headers: NO_CACHE });
  }
  const observer = { lat, lng, groundHeightMeters: isFinite(heightM) ? heightM : 0 };

  const historyDays = Math.min(Math.max(parseFloat(sp.get("historyDays") ?? "30"), 1), 90);
  const forecastDays = Math.min(Math.max(parseFloat(sp.get("forecastDays") ?? "14"), 1), 30);

  // Same camera the live Photographer/Candidates tools use for their "in frame"
  // check — passed through so the fallback list reflects the photographer's
  // actual current lens instead of a fixed assumption.
  const focalLengthMm = Math.min(Math.max(parseFloat(sp.get("focalLengthMm") ?? "600"), 50), 2400);
  const sensorTypeParam = sp.get("sensorType") ?? "fullFrame";
  const sensorType: CameraSensorType =
    sensorTypeParam in CAMERA_SENSOR_CROP ? (sensorTypeParam as CameraSensorType) : "fullFrame";
  const halfVerticalFovDeg = verticalFovDeg(focalLengthMm, sensorType) / 2;
  const halfHorizontalFovDeg = horizontalFovDeg(focalLengthMm, sensorType) / 2;

  const cacheKey = `${dbVersionKey()}|${lat.toFixed(3)}|${lng.toFixed(3)}|${heightM}|${historyDays}|${forecastDays}|${focalLengthMm}|${sensorType}`;
  const cached = bodyCache.get(cacheKey);
  if (cached) return new NextResponse(cached, { headers: JSON_HEADERS });

  const nowMs = Date.now();
  const fromMs = nowMs - historyDays * DAY_MS;
  const toMs = nowMs + forecastDays * DAY_MS;

  let sessionsByCallsign: Map<string, RoutePoint[][]>;
  try {
    sessionsByCallsign = await getAllCallsignSessions(fromMs, nowMs);
  } catch (e) {
    console.error("[flight-log/transit-calendar]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_CACHE });
  }

  const { entries, closest } = await forecastTransitCalendar(sessionsByCallsign, {
    observer,
    nowMs,
    toMs,
    halfVerticalFovDeg,
    halfHorizontalFovDeg,
  });

  const body = JSON.stringify({ entries, closest, historyDays, forecastDays });
  bodyCache.set(cacheKey, body);
  return new NextResponse(body, { headers: JSON_HEADERS });
}
