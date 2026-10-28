import { getMoonPosition } from "../astro/moon";
import type { GroundObserver, MoonPosition } from "@/types";
import { destinationByAzimuthMeters } from "./wgs84";
import { horizontalToPoint } from "./horizontal";
import { MAX_ALIGNMENT_LOOKAHEAD_SEC, signedAzimuthGapDeg } from "./lineOfSightKinematics";

/** Numerical accuracy, not a transit classification threshold. */
export const ALIGNMENT_RESIDUAL_DEG = 0.001;
const BRACKET_STEP_SEC = 10;
const MAX_BISECTIONS = 24;
// Exact coordinates and times; bounded so repeated live ticks cannot grow memory.
const moonCache = new Map<string, MoonPosition>();
export function getAlignmentMoonPosition(atMs: number, observer: GroundObserver): MoonPosition {
  const key = `${atMs}|${observer.lat}|${observer.lng}|${observer.groundHeightMeters}`;
  const cached = moonCache.get(key);
  if (cached) return cached;
  const moon = getMoonPosition(new Date(atMs), observer.lat, observer.lng, observer.groundHeightMeters);
  if (moonCache.size >= 2048) moonCache.delete(moonCache.keys().next().value!);
  moonCache.set(key, moon);
  return moon;
}

/** Find a verified crossing, not an extrapolation of the current angular rate.
 * The sine residual is continuous across north and at the opposite azimuth.
 * Opposite-direction roots / overhead jumps are rejected by the actual azimuth gap.
 */
export function solveAzimuthAlignment(args: {
  observer: GroundObserver;
  position: { lat: number; lng: number };
  altitudeMeters: number;
  speedMps: number;
  trackDeg: number;
  atMs: number;
}) {
  const { observer, position, altitudeMeters, speedMps, trackDeg, atMs } = args;
  if (![position.lat, position.lng, altitudeMeters, speedMps, trackDeg, atMs].every(Number.isFinite) || speedMps < 1) return null;
  const evaluate = (timeSec: number) => {
    const futurePosition = destinationByAzimuthMeters(position.lat, position.lng, trackDeg, speedMps * timeSec);
    const aircraft = horizontalToPoint(observer, futurePosition.lat, futurePosition.lng, altitudeMeters);
    const moon = getAlignmentMoonPosition(atMs + timeSec * 1000, observer);
    const gap = signedAzimuthGapDeg(aircraft.azimuthDeg, moon.azimuthDeg);
    return { timeSec, position: futurePosition, aircraft, moon, gap, residual: Math.sin(gap * Math.PI / 180) };
  };
  let left = evaluate(0);
  if (Math.abs(left.gap) <= ALIGNMENT_RESIDUAL_DEG) return left;
  for (let t = BRACKET_STEP_SEC; t <= MAX_ALIGNMENT_LOOKAHEAD_SEC; t += BRACKET_STEP_SEC) {
    const right = evaluate(t);
    if (Math.abs(right.gap) <= ALIGNMENT_RESIDUAL_DEG) return right;
    if (left.residual * right.residual < 0) {
      let lo = left;
      let hi = right;
      for (let i = 0; i < MAX_BISECTIONS; i++) {
        const mid = evaluate((lo.timeSec + hi.timeSec) / 2);
        if (Math.abs(mid.gap) <= ALIGNMENT_RESIDUAL_DEG) return mid;
        if (lo.residual * mid.residual <= 0) hi = mid;
        else lo = mid;
      }
      // A root on the opposite ray, or an undefined azimuth at the zenith,
      // must never be treated as alignment with the Moon.
    }
    left = right;
  }
  return null;
}
