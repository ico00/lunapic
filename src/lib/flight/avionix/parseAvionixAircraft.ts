import { resolveAircraftDimensionsByTypecode } from "@/lib/flight/aircraftTypeDimensions";
import { canonicalIcao24Id } from "@/lib/flight/icao24CanonicalId";
import type { FlightState } from "@/types/flight";
import type { GeoBounds } from "@/types/geo";

/**
 * Avionix openAir `GET /flight_updates` response shape — keyed by icao24 hex,
 * each aircraft is a fixed-order array. Non-aircraft keys (`timestamp`,
 * `update_age`) are not arrays, so `Array.isArray` is the discriminator —
 * more future-proof than hardcoding every meta key name.
 */
export type AvionixResponse = {
  readonly timestamp?: string;
  readonly update_age?: number;
  readonly [icao24: string]: unknown;
};

const FT_TO_M = 0.3048;
const KNOTS_TO_MPS = 0.514444;

function inBounds(lat: number, lng: number, b: GeoBounds): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

function trimmedOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

/**
 * Field order confirmed against the device's own `app/flight-data-updater.js`:
 * `[callsign, aircrafttype, registration, squawk, lat, lon, altitude_ft,
 * speed_kt, heading_deg, climbrate_fpm, origin, destination]`. Indices 10/11
 * (origin/destination) are dispatcher-inferred, not authoritative route data —
 * intentionally not mapped, `FlightState` has no field for them.
 */
export function avionixEntryToFlightState(
  icaoHex: string,
  entry: readonly unknown[],
  nowMs: number,
  bounds?: GeoBounds
): FlightState | null {
  if (!icaoHex) return null;

  const lat = finiteOrNull(entry[4]);
  const lon = finiteOrNull(entry[5]);
  if (lat == null || lon == null) return null;
  if (bounds && !inBounds(lat, lon, bounds)) return null;

  const icao = canonicalIcao24Id(icaoHex);

  const callSign = trimmedOrNull(entry[0]);
  let airlineIcao: string | null = null;
  if (callSign && callSign.length >= 3) {
    const prefix = callSign.slice(0, 3);
    if (/^[A-Za-z]{3}$/.test(prefix)) airlineIcao = prefix.toUpperCase();
  }

  const aircraftType = trimmedOrNull(entry[1]);
  const registration = trimmedOrNull(entry[2]);
  const squawk = trimmedOrNull(entry[3]);

  const altFt = finiteOrNull(entry[6]);
  const baroAltitudeMeters = altFt != null ? altFt * FT_TO_M : null;

  const speedKt = finiteOrNull(entry[7]);
  const groundSpeedMps = speedKt != null ? speedKt * KNOTS_TO_MPS : null;

  const heading = finiteOrNull(entry[8]);
  const trackDeg = heading != null ? ((heading % 360) + 360) % 360 : null;

  const verticalRateFpm = finiteOrNull(entry[9]);

  // Uređaj daje typecode izravno (npr. "A319") — nema potrebe za OpenSky
  // icao24-index prefetchom, dimenzije se popune odmah.
  const dims = resolveAircraftDimensionsByTypecode(aircraftType);

  return {
    id: icao,
    icao24: icao,
    callSign,
    airlineIcao,
    position: { lat, lng: lon },
    baroAltitudeMeters,
    geoAltitudeMeters: null,
    groundSpeedMps,
    trackDeg,
    timestamp: nowMs,
    adsbEmitterCategory: null,
    aircraftType,
    airlineName: null,
    wingspanMeters: dims?.wingspanMeters ?? null,
    lengthMeters: dims?.lengthMeters ?? null,
    registration,
    squawk,
    verticalRateFpm,
    rssi: null,
    aircraftDescription: null,
  };
}

export function flightsFromAvionixResponse(
  data: AvionixResponse,
  bounds?: GeoBounds
): readonly FlightState[] {
  const parsedTs = typeof data.timestamp === "string" ? Date.parse(data.timestamp) : NaN;
  const nowMs = isFinite(parsedTs) ? parsedTs : Date.now();

  const out: FlightState[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    const f = avionixEntryToFlightState(key, value, nowMs, bounds);
    if (f) out.push({ ...f, providerId: "avionix" });
  }
  return out;
}
