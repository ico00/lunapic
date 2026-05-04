import { appPath } from "@/lib/paths/appPath";
import {
  formatOpenSkyAircraftIndexLabel,
  openSkyAircraftIndexShardPrefix,
  type OpenSkyAircraftIndexTuple,
} from "@/lib/flight/openskyAircraftIndexShard";
import { canonicalIcao24Id } from "@/lib/flight/icao24CanonicalId";

const shardJsonCache = new Map<string, Record<string, unknown>>();
const inflightShard = new Map<string, Promise<Record<string, unknown>>>();

/** Izbjegava beskonačno čekanje na sporom mrežnom putu. */
const SHARD_FETCH_TIMEOUT_MS = 20_000;

function isTuple(v: unknown): v is OpenSkyAircraftIndexTuple {
  if (!Array.isArray(v)) {
    return false;
  }
  if (
    v.length === 2 &&
    typeof v[0] === "string" &&
    typeof v[1] === "string"
  ) {
    return true;
  }
  return (
    v.length === 3 &&
    typeof v[0] === "string" &&
    typeof v[1] === "string" &&
    typeof v[2] === "string"
  );
}

async function loadShard(prefix: string): Promise<Record<string, unknown>> {
  const hit = shardJsonCache.get(prefix);
  if (hit) {
    return hit;
  }
  const pending = inflightShard.get(prefix);
  if (pending) {
    return pending;
  }
  const url = appPath(`/data/opensky-aircraft/${prefix}.json`);
  const p = (async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), SHARD_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: ac.signal });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        console.warn(
          `[MoonTransit] OpenSky aircraft shard timeout (${SHARD_FETCH_TIMEOUT_MS} ms): ${url}`
        );
        throw new Error(`OpenSky aircraft shard timeout: ${url}`);
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
    if (res.status === 404) {
      const empty = Object.create(null);
      shardJsonCache.set(prefix, empty);
      return empty;
    }
    if (!res.ok) {
      throw new Error(`OpenSky aircraft index: ${res.status} ${url}`);
    }
    const data: unknown = await res.json();
    const rec =
      data != null && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : Object.create(null);
    shardJsonCache.set(prefix, rec);
    return rec;
  })();
  inflightShard.set(prefix, p);
  try {
    return await p;
  } finally {
    inflightShard.delete(prefix);
  }
}

/**
 * Dohvat tipa zrakoplova iz lokalnog OpenSky indeksa (shard po prvom bajtu ICAO24).
 * Vraća `null` ako nema sharda / zapisa.
 */
export async function fetchOpenSkyAircraftIndexEntry(
  icao24: string
): Promise<OpenSkyAircraftIndexTuple | null> {
  const id = canonicalIcao24Id(icao24);
  const prefix = openSkyAircraftIndexShardPrefix(id);
  if (!prefix) {
    return null;
  }
  const shard = await loadShard(prefix);
  const raw = shard[id];
  if (!isTuple(raw)) {
    return null;
  }
  return raw.length === 3
    ? raw
    : [raw[0], raw[1], ""] as const;
}

/**
 * Isti podatak kao string za `FlightState.aircraftType`, ili prazan string.
 */
export async function fetchOpenSkyAircraftTypeLabel(
  icao24: string
): Promise<string> {
  const row = await fetchOpenSkyAircraftIndexEntry(icao24);
  if (!row) {
    return "";
  }
  return formatOpenSkyAircraftIndexLabel(row).trim();
}
