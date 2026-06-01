import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import type { FlightState } from "@/types/flight";

const EXTRAPOLATE_DT_CAP_SEC = 900; // OpenSky free API može biti 5–15 min stara
const MAX_LEAD_SEC = 40;

/**
 * Pomak OpenSky / ručni: ‚gurni‛ zrakoplov naprijed u vremenu (pozicija duž traga).
 */
export function extrapolateFlightForDisplay(
  f: FlightState,
  wallNowMs: number,
  latencySkewMs: number
): FlightState {
  const v = f.groundSpeedMps ?? 200;
  const tr = f.trackDeg;
  const rawDt = (wallNowMs + latencySkewMs - f.timestamp) / 1000;
  const dt = Math.max(0, Math.min(EXTRAPOLATE_DT_CAP_SEC, rawDt));
  if (dt < 0.1 || v < 1 || tr == null || !Number.isFinite(tr)) {
    return f;
  }
  const p = destinationByAzimuthMeters(
    f.position.lat,
    f.position.lng,
    tr,
    v * Math.min(MAX_LEAD_SEC, dt)
  );
  return { ...f, position: p };
}
