import { DEFAULT_OBSERVER_LOCATION } from "@/lib/defaultObserverLocation";
import type { GroundObserver } from "@/types/geo";
import type { MoonState } from "@/types/moon";

/**
 * Reference moon geometry recorded at the built-in default balcony observer
 * (clear sight line, near-full moon). Used only when the current observer is
 * still essentially that stand.
 */
export const BALCONY_TRANSIT_WATCH_REFERENCE = {
  altitudeMidDeg: 9.56,
  altitudeHalfBandDeg: 2.5,
  azimuthMidDeg: 132.52,
  azimuthHalfBandDeg: 15,
  minIlluminationFraction: 0.93,
  angularRadiusMidDeg: 0.248,
  angularRadiusHalfBandDeg: 0.04,
} as const;

/** ~330 m latitude / ~230 m longitude at mid-latitudes — same “stand” as default. */
const OBSERVER_MATCH_MAX_DELTA_DEG = 0.003;

function smallestAzimuthDeltaDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function observerMatchesReferenceBalcony(observer: GroundObserver): boolean {
  const d = DEFAULT_OBSERVER_LOCATION;
  return (
    Math.abs(observer.lat - d.lat) <= OBSERVER_MATCH_MAX_DELTA_DEG &&
    Math.abs(observer.lng - d.lng) <= OBSERVER_MATCH_MAX_DELTA_DEG
  );
}

/**
 * `true` when the observer is still the default balcony point and the simulated
 * moon matches the saved “good transit-wait” geometry (altitude / azimuth / phase).
 */
export function isBalconyTransitWatchIdeal(
  moon: MoonState,
  observer: GroundObserver
): boolean {
  if (!observerMatchesReferenceBalcony(observer)) {
    return false;
  }
  const ref = BALCONY_TRANSIT_WATCH_REFERENCE;
  if (moon.altitudeDeg < ref.altitudeMidDeg - ref.altitudeHalfBandDeg) {
    return false;
  }
  if (moon.altitudeDeg > ref.altitudeMidDeg + ref.altitudeHalfBandDeg) {
    return false;
  }
  if (
    smallestAzimuthDeltaDeg(moon.azimuthDeg, ref.azimuthMidDeg) >
    ref.azimuthHalfBandDeg
  ) {
    return false;
  }
  if (moon.illuminationFraction < ref.minIlluminationFraction) {
    return false;
  }
  if (
    Math.abs(moon.apparentRadius.degrees - ref.angularRadiusMidDeg) >
    ref.angularRadiusHalfBandDeg
  ) {
    return false;
  }
  return moon.altitudeDeg > 0;
}
