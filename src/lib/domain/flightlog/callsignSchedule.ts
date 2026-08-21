import type { RoutePoint } from "@/lib/db/flightLogDb";
import { geodeticToEcef } from "@/lib/domain/geometry/wgs84";

/**
 * Schedule statistics shared by the flight-log forecasts.
 *
 * Airline schedules repeat daily or weekly, so the circular mean of a
 * callsign's time-of-day is a robust estimator even with missed days in
 * between. Everything here is a *statistical* forecast — once a flight is
 * actually airborne the live candidate pipeline is authoritative.
 */

const DAY_MS = 86_400_000;
const METERS_PER_DEG_LAT = 111_320;

export interface ClosestApproach {
  /** When the pass came nearest the observer. */
  timeMs: number;
  lat: number;
  lng: number;
  altM: number;
  slantM: number;
}

export interface NextApproachPrediction {
  estimateMs: number;
  stdMinutes: number;
  /** UTC weekdays (0 = Sun) the callsign was observed on. */
  weekdays: number[];
}

/**
 * Closest point (by ECEF slant distance) a session's track passes to the
 * observer, or `null` if it never comes within `maxSlantM`.
 */
export function closestApproachInSession(
  points: readonly RoutePoint[],
  observerEcef: { x: number; y: number; z: number },
  maxSlantM: number
): ClosestApproach | null {
  let best: ClosestApproach | null = null;
  for (const p of points) {
    if (p.alt_baro_m == null) continue;
    const pAc = geodeticToEcef(p.lat, p.lng, p.alt_baro_m);
    const slantM = Math.hypot(
      pAc.x - observerEcef.x,
      pAc.y - observerEcef.y,
      pAc.z - observerEcef.z
    );
    if (!best || slantM < best.slantM) {
      best = { timeMs: p.logged_at, lat: p.lat, lng: p.lng, altM: p.alt_baro_m, slantM };
    }
  }
  if (!best || best.slantM > maxSlantM) return null;
  return best;
}

/**
 * Circular-mean time-of-day prediction anchored on each session's
 * closest-approach timestamp — the moment that actually matters for a transit
 * — rather than the session's overall mid-time.
 */
export function predictNextApproach(
  approaches: readonly ClosestApproach[],
  nowMs: number,
  searchDays = 32
): NextApproachPrediction | null {
  let sx = 0;
  let sy = 0;
  for (const a of approaches) {
    const angle = ((a.timeMs % DAY_MS) / DAY_MS) * 2 * Math.PI;
    sx += Math.cos(angle);
    sy += Math.sin(angle);
  }
  const n = approaches.length;
  if (n === 0) return null;
  const R = Math.sqrt(sx * sx + sy * sy) / n;
  if (R < 0.5) return null; // scattered across the day — not a regular schedule

  const meanAngle = Math.atan2(sy, sx);
  const meanDayMs = ((meanAngle / (2 * Math.PI)) * DAY_MS + DAY_MS) % DAY_MS;
  const stdMinutes = Math.sqrt(-2 * Math.log(R)) * (1440 / (2 * Math.PI));

  const weekdays = [...new Set(approaches.map((a) => new Date(a.timeMs).getUTCDay()))].sort();
  const useWeekdays = n >= 4 && weekdays.length < 7;

  const todayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  for (let d = 0; d < searchDays; d++) {
    const candidate = todayStart + d * DAY_MS + meanDayMs;
    if (candidate <= nowMs) continue;
    if (useWeekdays && !weekdays.includes(new Date(candidate).getUTCDay())) continue;
    return { estimateMs: candidate, stdMinutes: Math.round(stdMinutes), weekdays };
  }
  return null;
}

/** One session plus the instant its track is aligned on. */
export interface AnchoredSession {
  readonly points: readonly RoutePoint[];
  readonly anchorMs: number;
}

export interface MeanTrackSample {
  /** Seconds relative to the predicted closest approach; negative = inbound. */
  readonly offsetSec: number;
  readonly lat: number;
  readonly lng: number;
  readonly altitudeMeters: number;
  /** How many historical sessions contributed to this sample. */
  readonly sessionCount: number;
  /**
   * RMS horizontal scatter of those sessions around the mean (m). This is the
   * honest error bar on any position derived from the mean track — when it is
   * far larger than a transit's cross-track tolerance (~100 m), the forecast
   * marks a region worth visiting, not a spot worth standing on.
   */
  readonly spreadMeters: number;
}

/** Linear interpolation of a session's track at an absolute instant. */
function interpolateSessionAt(
  points: readonly RoutePoint[],
  atMs: number,
  maxGapMs: number
): { lat: number; lng: number; altitudeMeters: number } | null {
  if (points.length === 0) return null;
  if (atMs < points[0]!.logged_at || atMs > points[points.length - 1]!.logged_at) {
    return null;
  }
  let i = 1;
  while (i < points.length && points[i]!.logged_at < atMs) i += 1;
  const a = points[i - 1]!;
  const b = points[i] ?? a;
  const span = b.logged_at - a.logged_at;
  if (span > maxGapMs) return null; // coverage hole — do not invent a position
  if (a.alt_baro_m == null || b.alt_baro_m == null) return null;
  const f = span > 0 ? (atMs - a.logged_at) / span : 0;
  return {
    lat: a.lat + f * (b.lat - a.lat),
    lng: a.lng + f * (b.lng - a.lng),
    altitudeMeters: a.alt_baro_m + f * (b.alt_baro_m - a.alt_baro_m),
  };
}

/**
 * Mean track in **time-relative** coordinates: for each offset from the
 * anchor, the average position across sessions that were airborne and in
 * coverage at that offset.
 *
 * Time alignment (rather than the path-length resampling `callsign-analysis`
 * uses for its mean route) is what makes the result usable for geometry: the
 * Moon moves 0.25° per minute, so a predicted position is only meaningful
 * paired with the instant it belongs to.
 */
export function meanTrackAroundApproach(
  sessions: readonly AnchoredSession[],
  offsetsSec: readonly number[],
  minSessions: number,
  maxGapMs = 90_000
): MeanTrackSample[] {
  const out: MeanTrackSample[] = [];
  for (const offsetSec of offsetsSec) {
    const samples: { lat: number; lng: number; altitudeMeters: number }[] = [];
    for (const session of sessions) {
      const s = interpolateSessionAt(
        session.points,
        session.anchorMs + offsetSec * 1000,
        maxGapMs
      );
      if (s) samples.push(s);
    }
    if (samples.length < minSessions) continue;

    const lat = samples.reduce((s, p) => s + p.lat, 0) / samples.length;
    const lng = samples.reduce((s, p) => s + p.lng, 0) / samples.length;
    const altitudeMeters =
      samples.reduce((s, p) => s + p.altitudeMeters, 0) / samples.length;

    const lngScale = METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    const variance =
      samples.reduce((s, p) => {
        const dx = (p.lng - lng) * lngScale;
        const dy = (p.lat - lat) * METERS_PER_DEG_LAT;
        return s + dx * dx + dy * dy;
      }, 0) / samples.length;

    out.push({
      offsetSec,
      lat,
      lng,
      altitudeMeters,
      sessionCount: samples.length,
      spreadMeters: Math.sqrt(variance),
    });
  }
  return out;
}
