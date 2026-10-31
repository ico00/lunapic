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

type SkyPoint = { altitudeDeg: number; azimuthDeg: number };
type Vector = readonly [number, number, number];

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function skyUnitVector({ altitudeDeg, azimuthDeg }: SkyPoint): Vector {
  const alt = toRad(altitudeDeg);
  const az = toRad(azimuthDeg);
  return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
}

/**
 * Closest approach of the arc `from → to` to `target`.
 *
 * A straight flight segment seen from one point lies in a plane through that
 * point, so it is a great circle on the sky and the minimum is exact. Between
 * two samples 15 s apart an aircraft at 30 km moves ~6.6°, a dozen Moon
 * diameters, so checking only the samples misses almost every crossing.
 *
 * `fraction` is the position on the arc, 0 at `from` and 1 at `to`.
 */
export function closestApproachOnArc(
  from: SkyPoint,
  to: SkyPoint,
  target: SkyPoint
): { separationDeg: number; fraction: number } {
  const endpoint = () => {
    const toFrom = angularSeparationDeg(from, target);
    const toTo = angularSeparationDeg(to, target);
    return toFrom <= toTo
      ? { separationDeg: toFrom, fraction: 0 }
      : { separationDeg: toTo, fraction: 1 };
  };
  const a = skyUnitVector(from);
  const b = skyUnitVector(to);
  const t = skyUnitVector(target);
  const normal = cross(a, b);
  const sinArc = Math.hypot(...normal);
  if (sinArc < 1e-12) {
    return endpoint();
  }
  const n: Vector = [normal[0] / sinArc, normal[1] / sinArc, normal[2] / sinArc];
  const arc = Math.atan2(sinArc, dot(a, b));
  const along = Math.atan2(dot(t, cross(n, a)), dot(t, a));
  if (along < 0 || along > arc) {
    return endpoint();
  }
  const separationRad = Math.asin(Math.min(1, Math.abs(dot(t, n))));
  return { separationDeg: (separationRad * 180) / Math.PI, fraction: along / arc };
}
