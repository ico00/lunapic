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

export function timeDeltaMinutesLabel(deltaMs: number): string {
  const s = Math.round(deltaMs / 60_000);
  if (s === 0) {
    return "0 min";
  }
  return `${s > 0 ? "+" : "−"}${Math.abs(s)} min`;
}
