import type { GeoBounds } from "@/types/geo";

const KM_PER_DEG_LAT = 111.0;
/** Izbjegava neograničeno širenje dLng u ekstremnim polarnim širinama. */
const MIN_COS_LAT = 0.2;

/**
 * Osovinski poravnat WGS84 okvir oko točke, aproksimacija kruga radijusa `radiusKm`.
 * (OpenSky / regionalni dohvat, ne točna geodetska ploha.)
 */
export function geoBoundsAroundPointKm(
  latDeg: number,
  lngDeg: number,
  radiusKm: number
): GeoBounds {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const cosLat = Math.cos((latDeg * Math.PI) / 180);
  const cosClamped = Math.max(MIN_COS_LAT, Math.abs(cosLat));
  const dLng = radiusKm / (KM_PER_DEG_LAT * cosClamped);
  return {
    south: latDeg - dLat,
    north: latDeg + dLat,
    west: lngDeg - dLng,
    east: lngDeg + dLng,
  };
}
