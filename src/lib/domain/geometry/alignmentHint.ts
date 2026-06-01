import { toRad } from "./wgs84";

/** Udaljeni kutni odmak: od azimuta Mjesca do zrakoplova, u [-180, 180]°. */
export function signedAzimuthDiffFromMoonToAcDeg(
  moonAzDeg: number,
  acAzDeg: number
): number {
  return ((acAzDeg - moonAzDeg + 540) % 360) - 180;
}

/**
 * Approx. shift (m) along north/south (heuristic for UI hints).
 * Angle sign: tilted toward where the line approaches the Moon’s center.
 */
export function nudgeNorthSouthMeters(
  signedMoonToAcDeg: number,
  latDeg: number
): { meters: number; cardinal: "north" | "south" } {
  const d = signedMoonToAcDeg;
  if (Math.abs(d) < 0.02) {
    return { meters: 0, cardinal: "north" };
  }
  const cosLat = Math.max(0.2, Math.cos(toRad(Math.abs(latDeg))));
  const m = Math.min(20_000, Math.abs(d) * 12 * 50 * (1 / cosLat));
  return {
    meters: m,
    cardinal: d > 0 ? "south" : "north",
  };
}

/**
 * True bearing (0–360°) the observer should walk to centre the transit,
 * plus approximate distance in metres.
 *
 * The correction direction is always perpendicular to the Moon's ray:
 *   bearingDeg = moonAzDeg + 90° × sign(signedDiff)
 *
 * sign > 0 → aircraft is clockwise of Moon → move clockwise-perp (bearingDeg = moonAz + 90)
 * sign < 0 → aircraft is counter-clockwise → move counter-clockwise-perp (bearingDeg = moonAz - 90)
 */
export function nudgeBearing(
  signedMoonToAcDeg: number,
  moonAzDeg: number
): { bearingDeg: number; meters: number } {
  const d = signedMoonToAcDeg;
  if (Math.abs(d) < 0.02) {
    return { bearingDeg: 0, meters: 0 };
  }
  const sign = d > 0 ? 1 : -1;
  const bearingDeg = ((moonAzDeg + 90 * sign) + 360) % 360;
  const meters = Math.min(20_000, Math.abs(d) * 12 * 50);
  return { bearingDeg, meters };
}

export function timeDeltaMinutesLabel(deltaMs: number): string {
  const s = Math.round(deltaMs / 60_000);
  if (s === 0) {
    return "0 min";
  }
  return `${s > 0 ? "+" : "−"}${Math.abs(s)} min`;
}
