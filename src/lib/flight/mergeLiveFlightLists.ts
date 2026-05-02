import { canonicalIcao24Id } from "@/lib/flight/icao24CanonicalId";
import { mergeStickyFlightMetadata } from "@/lib/flight/mergeStickyFlightMetadata";
import type { FlightState } from "@/types/flight";

function withCanonicalId(f: FlightState): FlightState {
  const id = canonicalIcao24Id(f.id);
  return {
    ...f,
    id,
    icao24: f.icao24 != null ? canonicalIcao24Id(String(f.icao24)) : id,
  };
}

/**
 * Dva snimka istog `id` (ICAO24): noviji `timestamp` kao geometrija, metapodaci
 * se lijepe kao u {@link mergeStickyFlightMetadata}.
 */
export function mergeTwoLiveFlightSnapshots(
  a: FlightState,
  b: FlightState
): FlightState {
  const newerFirst = a.timestamp >= b.timestamp;
  const primary = newerFirst ? a : b;
  const secondary = newerFirst ? b : a;
  return mergeStickyFlightMetadata([primary], [secondary])[0];
}

/**
 * Spaja više listi iz live izvora u jednu mapu po `flight.id` (ICAO24).
 */
export function mergeLiveFlightLists(
  lists: readonly (readonly FlightState[])[]
): readonly FlightState[] {
  if (lists.length === 0) {
    return [];
  }
  if (lists.length === 1) {
    return lists[0];
  }
  const byId = new Map<string, FlightState>();
  for (const list of lists) {
    for (const f of list) {
      const fNorm = withCanonicalId(f);
      const key = fNorm.id;
      const cur = byId.get(key);
      if (cur == null) {
        byId.set(key, fNorm);
      } else {
        byId.set(key, mergeTwoLiveFlightSnapshots(cur, fNorm));
      }
    }
  }
  return [...byId.values()];
}
