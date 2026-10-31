import type { RoutePoint } from "@/lib/db/flightLogDb";
import { getMoonPosition, getMoonState, getSunAltitudeDeg } from "@/lib/domain/astro/moon";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";

const DAY_MS = 86_400_000;
const SPEED_MPS = 230;

export const forecastObserver = { lat: 45.8, lng: 16.0, groundHeightMeters: 100 };
export const forecastNowMs = Date.UTC(2026, 9, 31, 12, 0, 0);

function moonAt(atMs: number) {
  const { lat, lng, groundHeightMeters } = forecastObserver;
  return getMoonPosition(new Date(atMs), lat, lng, groundHeightMeters);
}

/** Prvi pun sat od sada u kojem je Mjesec visoko, osvijetljen i na tamnom nebu. */
export function instantWithVisibleMoon(): number {
  const { lat, lng, groundHeightMeters } = forecastObserver;
  for (let t = Math.ceil(forecastNowMs / 3_600_000) * 3_600_000; ; t += 3_600_000) {
    const at = new Date(t);
    const moon = getMoonState(at, lat, lng, groundHeightMeters);
    if (
      moon.altitudeDeg > 35 &&
      moon.illuminationFraction > 0.3 &&
      getSunAltitudeDeg(at, lat, lng, groundHeightMeters) < -12
    ) {
      return t;
    }
  }
}

/**
 * Redoviti let: raspored mu je u sat `closestAtMs`, a avion je `crossingOffsetSec`
 * nakon najbližeg prolaza točno ispred Mjeseca, ali samo na dan `closestAtMs`.
 */
export function sessionsCrossingMoon(closestAtMs: number, crossingOffsetSec: number): RoutePoint[][] {
  const moon = moonAt(closestAtMs + crossingOffsetSec * 1000);
  const groundM = 25_000;
  const { lat, lng } = forecastObserver;
  const crossing = destinationByAzimuthMeters(lat, lng, moon.azimuthDeg, groundM);

  let low = 0;
  let high = 40_000;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const { altitudeDeg } = horizontalToPoint(forecastObserver, crossing.lat, crossing.lng, mid);
    if (altitudeDeg < moon.altitudeDeg) low = mid;
    else high = mid;
  }

  const legM = SPEED_MPS * crossingOffsetSec;
  const offAxisDeg = (Math.asin(legM / groundM) * 180) / Math.PI;
  const trackDeg = (moon.azimuthDeg - offAxisDeg + 90 + 360) % 360;
  const positionAt = (offsetSec: number) => {
    const fromCrossingM = SPEED_MPS * (offsetSec - crossingOffsetSec);
    return fromCrossingM >= 0
      ? destinationByAzimuthMeters(crossing.lat, crossing.lng, trackDeg, fromCrossingM)
      : destinationByAzimuthMeters(crossing.lat, crossing.lng, (trackDeg + 180) % 360, -fromCrossingM);
  };

  const sessions: RoutePoint[][] = [];
  const firstDayBack = Math.ceil((closestAtMs - forecastNowMs) / DAY_MS);
  for (let back = firstDayBack; back < firstDayBack + 6; back += 1) {
    const anchorMs = closestAtMs - back * DAY_MS;
    const points: RoutePoint[] = [];
    for (let offsetSec = -300; offsetSec <= 300; offsetSec += 15) {
      const p = positionAt(offsetSec);
      points.push({
        lat: p.lat,
        lng: p.lng,
        alt_baro_m: low,
        logged_at: anchorMs + offsetSec * 1000,
      } as RoutePoint);
    }
    sessions.push(points);
  }
  return sessions;
}
