import { toRad } from "./wgs84";

/**
 * Great-circle distance on the celestial sphere between two
 * (altitude, azimuth) pairs in degrees, both azimuths from north.
 */
export function angularSeparationDeg(
  a: { altitudeDeg: number; azimuthDeg: number },
  b: { altitudeDeg: number; azimuthDeg: number }
): number {
  const al = toRad(a.altitudeDeg);
  const bl = toRad(b.altitudeDeg);
  const da = toRad(
    ((b.azimuthDeg - a.azimuthDeg + 540) % 360) - 180
  );
  const sinAl = Math.sin(al);
  const sinBl = Math.sin(bl);
  const cosAl = Math.cos(al);
  const cosBl = Math.cos(bl);
  const cosDaz = Math.cos(da);
  const cosD =
    sinAl * sinBl + cosAl * cosBl * cosDaz;
  return (Math.acos(Math.min(1, Math.max(-1, cosD))) * 180) / Math.PI;
}
