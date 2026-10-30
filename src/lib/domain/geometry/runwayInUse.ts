import { initialBearingDeg } from "@/lib/domain/geometry/wgs84";
import { LDZA_RUNWAY_04_22_LINE } from "@/lib/map/airportRunwayConfig";

export type RunwayDesignator = "04" | "22";

export type RunwayUseSample = {
  readonly icao24: string;
  readonly lat: number;
  readonly lng: number;
  readonly altM: number | null;
  readonly trackDeg: number | null;
  readonly loggedAt: number;
};

export type RunwayInUse = {
  /** Null when the last hour does not settle it: too little traffic, or a mixed picture. */
  readonly runway: RunwayDesignator | null;
  readonly aircraft04: number;
  readonly aircraft22: number;
  readonly lastSeenMs: number | null;
};

export const RUNWAY_IN_USE_WINDOW_MS = 60 * 60_000;
/** One aircraft is not a signal: a lone go-around or training circuit reads the same. */
const MIN_AIRCRAFT = 2;
/** Below this share the direction is changing, or the sample is too small to say. */
const MIN_SHARE = 0.75;
const LDZA_ELEVATION_M = 107;
const MAX_HEIGHT_AGL_M = 1_000;
const MAX_ALONG_AXIS_M = 15_000;
const MAX_CROSS_AXIS_M = 1_500;
const MAX_TRACK_OFFSET_DEG = 15;
const METERS_PER_DEG_LAT = 111_132;

const [south, north] = [LDZA_RUNWAY_04_22_LINE[LDZA_RUNWAY_04_22_LINE.length - 1]!, LDZA_RUNWAY_04_22_LINE[0]!];
const AXIS_DEG = initialBearingDeg(south, north);
const AXIS_RAD = (AXIS_DEG * Math.PI) / 180;
const MID_LAT = (south[0] + north[0]) / 2;
const MID_LNG = (south[1] + north[1]) / 2;
const METERS_PER_DEG_LNG = METERS_PER_DEG_LAT * Math.cos((MID_LAT * Math.PI) / 180);

function trackOffsetDeg(trackDeg: number, targetDeg: number): number {
  return Math.abs(((trackDeg - targetDeg + 540) % 360) - 180);
}

/**
 * Which way a sample uses the runway, or null when it is not on the extended
 * centreline. Landing and take-off on one runway fly the same track, so the
 * track alone gives the runway: north-east is 04, south-west is 22.
 */
function runwayOf(s: RunwayUseSample): RunwayDesignator | null {
  if (s.altM == null || s.trackDeg == null) return null;
  if (s.altM - LDZA_ELEVATION_M > MAX_HEIGHT_AGL_M) return null;
  const east = (s.lng - MID_LNG) * METERS_PER_DEG_LNG;
  const north = (s.lat - MID_LAT) * METERS_PER_DEG_LAT;
  const along = east * Math.sin(AXIS_RAD) + north * Math.cos(AXIS_RAD);
  const cross = east * Math.cos(AXIS_RAD) - north * Math.sin(AXIS_RAD);
  if (Math.abs(along) > MAX_ALONG_AXIS_M || Math.abs(cross) > MAX_CROSS_AXIS_M) return null;
  if (trackOffsetDeg(s.trackDeg, AXIS_DEG) <= MAX_TRACK_OFFSET_DEG) return "04";
  if (trackOffsetDeg(s.trackDeg, AXIS_DEG + 180) <= MAX_TRACK_OFFSET_DEG) return "22";
  return null;
}

/** Live evidence only: it says what the airport is doing now, not on a planned day. */
export function detectRunwayInUse(
  samples: readonly RunwayUseSample[],
  nowMs: number
): RunwayInUse {
  const on04 = new Set<string>();
  const on22 = new Set<string>();
  let lastSeenMs: number | null = null;
  for (const s of samples) {
    if (s.loggedAt > nowMs || nowMs - s.loggedAt > RUNWAY_IN_USE_WINDOW_MS) continue;
    const runway = runwayOf(s);
    if (runway == null) continue;
    (runway === "04" ? on04 : on22).add(s.icao24);
    if (lastSeenMs == null || s.loggedAt > lastSeenMs) lastSeenMs = s.loggedAt;
  }
  const aircraft04 = on04.size;
  const aircraft22 = on22.size;
  const total = aircraft04 + aircraft22;
  const top = Math.max(aircraft04, aircraft22);
  const decided = total >= MIN_AIRCRAFT && top / total >= MIN_SHARE;
  const runway: RunwayDesignator | null = !decided ? null : aircraft04 >= aircraft22 ? "04" : "22";
  return { runway, aircraft04, aircraft22, lastSeenMs };
}
