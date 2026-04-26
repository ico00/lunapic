import * as SunCalc from "suncalc";
import type { MoonState } from "@/types";
import { toDeg } from "../geometry/wgs84";

const MOON_MEAN_RADIUS_KM = 1737.4;

/**
 * Suncalc measures azimuth from the south, increasing toward the west.
 * Convert to true azimuth from north, clockwise, [0, 360).
 */
function southWestAzToNorthDeg(suncalcAzimuthRad: number): number {
  return ((toDeg(suncalcAzimuthRad) + 180) % 360 + 360) % 360;
}

/**
 * Moon state for the observer at a given time (Suncalc ephemeris).
 */
export function getMoonState(
  at: Date,
  observerLat: number,
  observerLng: number
): MoonState {
  const pos = SunCalc.getMoonPosition(at, observerLat, observerLng);
  const ill = SunCalc.getMoonIllumination(at);
  const altitudeDeg = toDeg(pos.altitude);
  const azimuthDeg = southWestAzToNorthDeg(pos.azimuth);
  const distKm = pos.distance;
  const apparentRadiusDeg =
    (Math.atan(MOON_MEAN_RADIUS_KM / distKm) * 180) / Math.PI;

  return {
    altitudeDeg,
    azimuthDeg,
    distanceKm: distKm,
    apparentRadius: { degrees: apparentRadiusDeg },
    phaseFraction: ill.phase,
  };
}
