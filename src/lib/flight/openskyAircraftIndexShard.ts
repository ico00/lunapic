import { canonicalIcao24Id } from "@/lib/flight/icao24CanonicalId";

/**
 * Iz OpenSky CSV indeksa: `[typecode | icaoaircrafttype, model, manufacturername]`.
 * Stariji shardovi mogu imati samo prva dva člana.
 */
export type OpenSkyAircraftIndexTuple = readonly [string, string, string?];

/**
 * Prva **tri** znaka ICAO24 (hex, lower) za putanju sharda `public/data/opensky-aircraft/{prefix}.json`.
 * (Dvoslovni shardovi su bili ~1 MiB+ JSON pa su `JSON.parse` zamrzavali UI.)
 */
export function openSkyAircraftIndexShardPrefix(
  icao24: string
): string | null {
  const c = canonicalIcao24Id(icao24);
  if (!/^[0-9a-f]{6}$/.test(c)) {
    return null;
  }
  return c.slice(0, 3);
}

/**
 * Jedna linija za UI / `FlightState.aircraftType` iz tuple vrijednosti indeksa.
 * Prioritet: **proizvođač + model** kad su oba dostupna; inače model, pa proizvođač, pa typecode.
 */
export function formatOpenSkyAircraftIndexLabel(
  tuple: OpenSkyAircraftIndexTuple
): string {
  const t = (tuple[0] ?? "").trim();
  const m = (tuple[1] ?? "").trim();
  const man = (tuple[2] ?? "").trim();

  if (man && m) {
    const ml = m.toLowerCase();
    const al = man.toLowerCase();
    if (ml.startsWith(al)) {
      return m;
    }
    return `${man} ${m}`;
  }
  if (m) {
    return m;
  }
  if (man) {
    return man;
  }
  return t;
}
