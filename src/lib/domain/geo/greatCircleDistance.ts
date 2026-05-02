const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_NM = 1852;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Veliki krug između dviju WGS84 točaka (m). */
export function greatCircleDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const s =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function greatCircleDistanceNauticalMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return greatCircleDistanceMeters(lat1, lng1, lat2, lng2) / METERS_PER_NM;
}
