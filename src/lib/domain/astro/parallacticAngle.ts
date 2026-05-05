import * as SunCalc from "suncalc";

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function normalizeSignedDeg(deg: number): number {
  const wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/**
 * Moon parallactic angle (deg) for observer/time, normalized to [-180, 180].
 * Positive/negative sign follows SunCalc output.
 */
export function getMoonParallacticAngleDeg(
  at: Date,
  observerLat: number,
  observerLng: number
): number {
  const pos = SunCalc.getMoonPosition(at, observerLat, observerLng);
  const rawDeg = toDeg(pos.parallacticAngle ?? 0);
  return normalizeSignedDeg(rawDeg);
}
