import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import type { FlightState } from "@/types/flight";

const EXTRAPOLATE_DT_CAP_SEC = 900; // OpenSky free API može biti 5–15 min stara
/**
 * Najviše koliko sekundi unaprijed smijemo gurnuti avion od zadnjeg fixa.
 * Exportano jer `flightFixFreshness` iz njega izvodi prag „fix je prestar da
 * bi se iz njega išta računalo” — iznad ovoga marker ionako stoji.
 */
export const MAX_LEAD_SEC = 40;

/**
 * Pretpostavljena brzina kad je izvor ne javlja. Exportana da `flightDisplayPositionFilter`
 * dead-reckona po ISTOJ brzini kojom se ovdje računa meta — inače filter i meta
 * trče različitim tempom i marker trajno zaostaje/juri.
 */
export const EXTRAPOLATION_FALLBACK_SPEED_MPS = 200;

const FPM_TO_MPS = 0.00508;

/**
 * Ispod ovoga se avion računa kao da leti ravno. Javljena brzina u ravnom letu
 * je šum: na produkcijskom logu (2026-10-30, 12 h) zadržavanje visine griješi
 * medijan 8 m na 120 s, a linearna projekcija tog šuma 8–52 m (p90).
 */
export const LEVEL_FLIGHT_MAX_FPM = 300;

/**
 * Vertikalna brzina za predviđanje, m/s (0 u ravnom letu ili kad nije poznata).
 * Isti log: pri ≥1000 ft/min greška visine na 60 s pada s medijana 457 m na 47 m.
 */
export function predictedVerticalRateMps(
  f: Pick<FlightState, "verticalRateFpm">
): number {
  const fpm = f.verticalRateFpm;
  if (fpm == null || !Number.isFinite(fpm) || Math.abs(fpm) < LEVEL_FLIGHT_MAX_FPM) {
    return 0;
  }
  return fpm * FPM_TO_MPS;
}

/**
 * Pomak OpenSky / ručni: ‚gurni‛ zrakoplov naprijed u vremenu (pozicija duž traga
 * i visina prema vertikalnoj brzini).
 */
export function extrapolateFlightForDisplay(
  f: FlightState,
  wallNowMs: number,
  latencySkewMs: number
): FlightState {
  const v = f.groundSpeedMps ?? EXTRAPOLATION_FALLBACK_SPEED_MPS;
  const tr = f.trackDeg;
  const rawDt = (wallNowMs + latencySkewMs - f.timestamp) / 1000;
  const dt = Math.max(0, Math.min(EXTRAPOLATE_DT_CAP_SEC, rawDt));
  if (dt < 0.1 || v < 1 || tr == null || !Number.isFinite(tr)) {
    return f;
  }
  const leadSec = Math.min(MAX_LEAD_SEC, dt);
  const p = destinationByAzimuthMeters(
    f.position.lat,
    f.position.lng,
    tr,
    v * leadSec
  );
  const climbMeters = predictedVerticalRateMps(f) * leadSec;
  return {
    ...f,
    position: p,
    baroAltitudeMeters:
      f.baroAltitudeMeters == null ? f.baroAltitudeMeters : f.baroAltitudeMeters + climbMeters,
    geoAltitudeMeters:
      f.geoAltitudeMeters == null ? f.geoAltitudeMeters : f.geoAltitudeMeters + climbMeters,
  };
}
