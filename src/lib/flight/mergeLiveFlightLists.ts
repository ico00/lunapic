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

/**
 * Kao `mergeLiveFlightLists`, ali lokalni SDR ima apsolutni prioritet: za svaki
 * zrakoplov prisutan u SDR listi koristi se SDR geometrija (pozicija, visina,
 * brzina, kurs); metapodaci koji nedostaju (tip aviona, airline) popunjavaju se
 * iz web API-ja. Zrakoplovi vidljivi samo na SDR dodaju se bez izmjena.
 */
export function mergeLiveFlightListsWithSdrPriority(
  sdrList: readonly FlightState[],
  webLists: readonly (readonly FlightState[])[]
): readonly FlightState[] {
  const webMerged = mergeLiveFlightLists(webLists);

  if (sdrList.length === 0) return webMerged;

  const sdrById = new Map<string, FlightState>();
  for (const f of sdrList) {
    const fNorm = withCanonicalId(f);
    sdrById.set(fNorm.id, fNorm);
  }

  const result = new Map<string, FlightState>();
  for (const f of webMerged) {
    const sdr = sdrById.get(f.id);
    if (sdr) {
      // SDR wins for geometry; web fills metadata gaps (aircraftType, airlineName…)
      result.set(f.id, mergeStickyFlightMetadata([sdr], [f])[0]);
    } else {
      result.set(f.id, f);
    }
  }
  for (const [id, f] of sdrById) {
    if (!result.has(id)) result.set(id, f);
  }

  return [...result.values()];
}
