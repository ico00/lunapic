import { NextRequest, NextResponse } from "next/server";
import { dbVersionKey, getAllCallsignSessions, type RoutePoint } from "@/lib/db/flightLogDb";
import { getMoonState } from "@/lib/domain/astro/moon";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { angularSeparationDeg } from "@/lib/domain/geometry/sky-separation";
import {
  aircraftAngularSizeDeg,
  CAMERA_SENSOR_CROP,
  horizontalFovDeg,
  verticalFovDeg,
  type CameraSensorType,
} from "@/lib/domain/geometry/shotFeasibility";
import { geodeticToEcef } from "@/lib/domain/geometry/wgs84";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json" };

/**
 * Forward-looking transit forecast: for callsigns with a regular schedule,
 * predict their next closest approach to the observer from historical
 * time-of-day statistics (same circular-mean approach as
 * `callsign-analysis`'s `computeNextPass`, anchored on closest-approach time
 * instead of session mid-time), then check the Moon's position *at that
 * predicted moment* using the same fixed-point separation check
 * `transit-history` uses for past events.
 *
 * This is a statistical forecast, not a geometric guarantee — the live
 * candidate pipeline remains authoritative once a flight is actually
 * airborne that day.
 */

const MAX_SLANT_M = 100_000;
const NEAR_TOL_DEG = 0.5;
const DEFAULT_WINGSPAN_M = 40;
const DAY_MS = 86_400_000;
/** Below this, a callsign's historical passes are too sparse to trust a schedule. */
const MIN_QUALIFYING_SESSIONS = 3;

interface ClosestApproach {
  timeMs: number;
  lat: number;
  lng: number;
  altM: number;
  slantM: number;
}

/** Every candidate that clears the moon-visibility floor, before the
 *  NEAR_TOL_DEG split into `entries` vs. `closest` fallback. */
interface EvaluatedCandidate {
  callsign: string;
  estimateMs: number;
  stdMinutes: number;
  sessionCount: number;
  kind: "transit" | "near" | "far";
  minSeparationDeg: number;
  /** Aircraft altitude minus Moon altitude, degrees — same quantity the live
   *  candidate pipeline calls `elevationGapAtAlignmentDeg`. Sign: positive =
   *  aircraft above the Moon. */
  elevationGapDeg: number;
  /** Whether the predicted position falls within the requested camera's
   *  frame if it were pointed at the Moon at that instant — both axes
   *  checked (unlike the live pipeline's elevation-only check, which can
   *  assume azimuth is already aligned; our forecast has no such anchor, so
   *  a large azimuth offset must still exclude it even with a small
   *  elevation gap). */
  inFrame: boolean;
  moonAltDeg: number;
  weekdays: number[];
}

export interface TransitCalendarEntry {
  callsign: string;
  estimateMs: number;
  stdMinutes: number;
  sessionCount: number;
  kind: "transit" | "near";
  minSeparationDeg: number;
  elevationGapDeg: number;
  inFrame: boolean;
  moonAltDeg: number;
  weekdays: number[];
}

/** A candidate that never got close enough for `TransitCalendarEntry.kind` to
 *  apply — same shape, minus `kind`. Returned as `closest` only when
 *  `entries` is empty, so the panel always has *something* to show instead
 *  of a flat "nothing found". */
export type TransitCalendarClosest = Omit<TransitCalendarEntry, "kind">;

/** Closest point (by ECEF slant distance) a session's track passes to the observer, or null if it never comes within MAX_SLANT_M. */
function closestApproachInSession(
  points: RoutePoint[],
  pObs: { x: number; y: number; z: number }
): ClosestApproach | null {
  let best: ClosestApproach | null = null;
  for (const p of points) {
    if (p.alt_baro_m == null) continue;
    const pAc = geodeticToEcef(p.lat, p.lng, p.alt_baro_m);
    const slantM = Math.hypot(pAc.x - pObs.x, pAc.y - pObs.y, pAc.z - pObs.z);
    if (!best || slantM < best.slantM) {
      best = { timeMs: p.logged_at, lat: p.lat, lng: p.lng, altM: p.alt_baro_m, slantM };
    }
  }
  if (!best || best.slantM > MAX_SLANT_M) return null;
  return best;
}

/**
 * Circular-mean time-of-day prediction, same statistics as
 * `callsign-analysis`'s `computeNextPass` but anchored on each session's
 * closest-approach timestamp — the moment that actually matters for a
 * transit — rather than the session's overall mid-time.
 */
function predictNextApproach(
  approaches: ClosestApproach[],
  nowMs: number
): { estimateMs: number; stdMinutes: number; weekdays: number[] } | null {
  let sx = 0, sy = 0;
  for (const a of approaches) {
    const angle = ((a.timeMs % DAY_MS) / DAY_MS) * 2 * Math.PI;
    sx += Math.cos(angle);
    sy += Math.sin(angle);
  }
  const n = approaches.length;
  const R = Math.sqrt(sx * sx + sy * sy) / n;
  if (R < 0.5) return null; // scattered across the day — not a regular schedule

  const meanAngle = Math.atan2(sy, sx);
  const meanDayMs = (((meanAngle / (2 * Math.PI)) * DAY_MS) + DAY_MS) % DAY_MS;
  const stdMinutes = Math.sqrt(-2 * Math.log(R)) * (1440 / (2 * Math.PI));

  const weekdays = [...new Set(approaches.map((a) => new Date(a.timeMs).getUTCDay()))].sort();
  const useWeekdays = n >= 4 && weekdays.length < 7;

  const todayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  for (let d = 0; d < 32; d++) {
    const candidate = todayStart + d * DAY_MS + meanDayMs;
    if (candidate <= nowMs) continue;
    if (useWeekdays && !weekdays.includes(new Date(candidate).getUTCDay())) continue;
    return { estimateMs: candidate, stdMinutes: Math.round(stdMinutes), weekdays };
  }
  return null;
}

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

  const pObs = geodeticToEcef(lat, lng, observer.groundHeightMeters);
  const evaluated: EvaluatedCandidate[] = [];

  for (const [callsign, sessions] of sessionsByCallsign) {
    const approaches: ClosestApproach[] = [];
    for (const session of sessions) {
      const ca = closestApproachInSession(session, pObs);
      if (ca) approaches.push(ca);
    }
    if (approaches.length < MIN_QUALIFYING_SESSIONS) continue;

    const prediction = predictNextApproach(approaches, nowMs);
    if (!prediction || prediction.estimateMs > toMs) continue;

    const meanLat = approaches.reduce((s, a) => s + a.lat, 0) / approaches.length;
    const meanLng = approaches.reduce((s, a) => s + a.lng, 0) / approaches.length;
    const meanAltM = approaches.reduce((s, a) => s + a.altM, 0) / approaches.length;
    const meanSlantM = approaches.reduce((s, a) => s + a.slantM, 0) / approaches.length;

    const moon = getMoonState(new Date(prediction.estimateMs), lat, lng, observer.groundHeightMeters);
    if (moon.altitudeDeg < CRITICAL_BELOW_DEG) continue;

    const ac = horizontalToPoint(observer, meanLat, meanLng, meanAltM);
    const sep = angularSeparationDeg(
      { altitudeDeg: ac.altitudeDeg, azimuthDeg: ac.azimuthDeg },
      { altitudeDeg: moon.altitudeDeg, azimuthDeg: moon.azimuthDeg }
    );
    const elevationGapDeg = ac.altitudeDeg - moon.altitudeDeg;
    // Pythagorean split of the already-correct spherical separation into a
    // vertical (elevationGapDeg) and horizontal component — avoids a second,
    // less accurate azimuth-difference-with-cosine-correction calculation.
    const horizontalOffsetDeg = Math.sqrt(Math.max(0, sep * sep - elevationGapDeg * elevationGapDeg));
    const inFrame = Math.abs(elevationGapDeg) <= halfVerticalFovDeg && horizontalOffsetDeg <= halfHorizontalFovDeg;

    const acRadiusDeg = aircraftAngularSizeDeg(DEFAULT_WINGSPAN_M, meanSlantM) / 2;
    const kind: EvaluatedCandidate["kind"] =
      sep <= moon.apparentRadius.degrees + acRadiusDeg
        ? "transit"
        : sep <= NEAR_TOL_DEG
          ? "near"
          : "far";

    evaluated.push({
      callsign,
      estimateMs: prediction.estimateMs,
      stdMinutes: prediction.stdMinutes,
      sessionCount: approaches.length,
      kind,
      minSeparationDeg: Number(sep.toFixed(3)),
      elevationGapDeg: Number(elevationGapDeg.toFixed(3)),
      inFrame,
      moonAltDeg: Number(moon.altitudeDeg.toFixed(1)),
      weekdays: prediction.weekdays,
    });
  }

  const entries: TransitCalendarEntry[] = evaluated
    .filter((c): c is EvaluatedCandidate & { kind: "transit" | "near" } => c.kind !== "far")
    .sort((a, b) => a.estimateMs - b.estimateMs);

  // Ranked by true angular separation from the Moon — the honest single
  // distance metric. `inFrame` (both-axes check) decides the badge, not the
  // ranking, so a candidate that's vertically close but azimuthally far
  // doesn't crowd out one that's genuinely nearer overall.
  const closest: TransitCalendarClosest[] =
    entries.length === 0
      ? [...evaluated]
          .sort((a, b) => a.minSeparationDeg - b.minSeparationDeg)
          .slice(0, 3)
          .map(({ kind: _kind, ...rest }) => rest)
      : [];

  const body = JSON.stringify({ entries, closest, historyDays, forecastDays });
  bodyCache.set(cacheKey, body);
  return new NextResponse(body, { headers: JSON_HEADERS });
}
