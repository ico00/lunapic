import type { GroundObserver } from "@/types";
import { ecefToEnu, enuToHorizontalDeg, geodeticToEcef } from "./wgs84";

/**
 * Geometric horizontal direction (alt/az) from a ground observer to a point
 * (aircraft) given WGS84 coordinates and height above the ellipsoid.
 * Uses a spherical-Earth ENU model (adequate for local moon/aircraft work).
 */
export function horizontalToPoint(
  observer: GroundObserver,
  targetLat: number,
  targetLng: number,
  targetEllipsoidHeightMeters: number
): { altitudeDeg: number; azimuthDeg: number } {
  const pObs = geodeticToEcef(
    observer.lat,
    observer.lng,
    observer.groundHeightMeters
  );
  const pTgt = geodeticToEcef(
    targetLat,
    targetLng,
    targetEllipsoidHeightMeters
  );
  const d = { x: pTgt.x - pObs.x, y: pTgt.y - pObs.y, z: pTgt.z - pObs.z };
  const enu = ecefToEnu(d, observer.lat, observer.lng);
  return enuToHorizontalDeg(enu.e, enu.n, enu.u);
}
