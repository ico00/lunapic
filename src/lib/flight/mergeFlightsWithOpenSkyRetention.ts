import { expandBounds } from "@/data/staticRouteUtils";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { mergeStickyFlightMetadata } from "@/lib/flight/mergeStickyFlightMetadata";
import type { FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";
import type { GeoBounds } from "@/types/geo";

/** Koliko dugo držimo zrakoplov nakon što nestane iz zadnjeg odgovora (OpenSky cache ~32 s). */
const MAX_OPENSKY_FLIGHT_RETENTION_MS = 32_000;
/** Briši `lastSeen` zapise starije od ovoga (sprječava rast mape). */
const LAST_SEEN_PRUNE_AGE_MS = 120_000;

const flightLastSeenAtMs = new Map<string, number>();

function pointInBounds(lat: number, lng: number, b: GeoBounds): boolean {
  return (
    lat >= b.south &&
    lat <= b.north &&
    lng >= b.west &&
    lng <= b.east
  );
}

function pruneStaleFlightLastSeen(nowMs: number): void {
  const cutoff = nowMs - LAST_SEEN_PRUNE_AGE_MS;
  for (const [id, t] of flightLastSeenAtMs) {
    if (t < cutoff) {
      flightLastSeenAtMs.delete(id);
    }
  }
}

/** Pozovi pri promjeni izvora letova da se ne miješaju ICAO24 ključevi između providera. */
export function clearOpenSkyFlightRetention(): void {
  flightLastSeenAtMs.clear();
}

/**
 * Nakon `getFlightsInBounds`: spajanje metapodataka + (OpenSky) kratko zadržavanje
 * letova koji su nestali iz odgovora ali su još nedavno bili vidljivi — smanjuje
 * treperenje na mobilnim uređajima kad API / filter „pulsira”.
 */
export function mergeFlightsWithOpenSkyRetention(
  fromProvider: readonly FlightState[],
  previousFlights: readonly FlightState[],
  context: {
    readonly providerId: FlightProviderId;
    readonly mapBounds: GeoBounds;
    readonly nowMs: number;
    readonly openSkyLatencySkewMs: number;
  }
): readonly FlightState[] {
  const mergedMeta = mergeStickyFlightMetadata(fromProvider, previousFlights);
  for (const f of mergedMeta) {
    flightLastSeenAtMs.set(f.id, context.nowMs);
  }

  if (
    context.providerId !== "opensky" &&
    context.providerId !== "adsbone"
  ) {
    pruneStaleFlightLastSeen(context.nowMs);
    return mergedMeta;
  }

  const relaxed = expandBounds(context.mapBounds, 0.1, 0.1);
  const inFresh = new Set(mergedMeta.map((f) => f.id));
  const retained: FlightState[] = [];

  for (const f of previousFlights) {
    if (inFresh.has(f.id)) {
      continue;
    }
    const last = flightLastSeenAtMs.get(f.id);
    if (last == null || context.nowMs - last > MAX_OPENSKY_FLIGHT_RETENTION_MS) {
      continue;
    }
    const projected = extrapolateFlightForDisplay(
      f,
      context.nowMs,
      context.openSkyLatencySkewMs
    );
    if (
      !pointInBounds(
        projected.position.lat,
        projected.position.lng,
        relaxed
      )
    ) {
      continue;
    }
    retained.push(f);
  }

  pruneStaleFlightLastSeen(context.nowMs);
  if (retained.length === 0) {
    return mergedMeta;
  }
  return [...mergedMeta, ...retained];
}
