const WGS84_A = 6_378_137;
const WGS84_F = 1 / 298.257_223_563;
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function toRad(deg: number): number {
  return deg * DEG2RAD;
}

export function toDeg(rad: number): number {
  return rad * RAD2DEG;
}

const EARTH_MEAN_R = 6_371_000;

/**
 * Ciljna točka duž luka velike kružnice (WGS84 aproks. sferom R).
 * @param azimuthFromNorthDeg azimut od sjevera, stupnjevi [0, 360)
 * @param distanceMeters udaljenost duž tla
 */
export function destinationByAzimuthMeters(
  lat0Deg: number,
  lon0Deg: number,
  azimuthFromNorthDeg: number,
  distanceMeters: number
): { lat: number; lng: number } {
  const δ = distanceMeters / EARTH_MEAN_R;
  const θ = toRad(azimuthFromNorthDeg);
  const φ1 = toRad(lat0Deg);
  const λ1 = toRad(lon0Deg);
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const sinφ2c = Math.min(1, Math.max(-1, sinφ2));
  const φ2 = Math.asin(sinφ2c);
  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2c;
  const λ2 = λ1 + Math.atan2(y, x);
  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}

/**
 * WGS84 geodetic to ECEF (meters).
 */
export function geodeticToEcef(
  latDeg: number,
  lonDeg: number,
  heightMeters: number
): { x: number; y: number; z: number } {
  const lat = toRad(latDeg);
  const lon = toRad(lonDeg);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const x = (n + heightMeters) * cosLat * cosLon;
  const y = (n + heightMeters) * cosLat * sinLon;
  const z = (n * (1 - WGS84_E2) + heightMeters) * sinLat;
  return { x, y, z };
}

/**
 * ECEF difference to local ENU (East-North-Up) at the observer.
 */
export function ecefToEnu(
  d: { x: number; y: number; z: number },
  lat0Deg: number,
  lon0Deg: number
): { e: number; n: number; u: number } {
  const lat = toRad(lat0Deg);
  const lon = toRad(lon0Deg);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const t = d;
  const east = -sinLon * t.x + cosLon * t.y;
  const north =
    -sinLat * cosLon * t.x - sinLat * sinLon * t.y + cosLat * t.z;
  const up = cosLat * cosLon * t.x + cosLat * sinLon * t.y + sinLat * t.z;
  return { e: east, n: north, u: up };
}

/**
 * Altitude (deg) and true azimuth from north, clockwise, [0, 360).
 */
export function enuToHorizontalDeg(e: number, n: number, u: number): {
  altitudeDeg: number;
  azimuthDeg: number;
} {
  const horizontal = Math.hypot(e, n);
  const altitudeRad = Math.atan2(u, horizontal);
  let azimuthRad = Math.atan2(e, n);
  if (azimuthRad < 0) {
    azimuthRad += 2 * Math.PI;
  }
  return { altitudeDeg: toDeg(altitudeRad), azimuthDeg: toDeg(azimuthRad) };
}
