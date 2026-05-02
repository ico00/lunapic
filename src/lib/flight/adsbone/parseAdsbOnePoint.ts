import { centerOfBounds } from "@/data/staticRouteUtils";
import { greatCircleDistanceNauticalMiles } from "@/lib/domain/geo/greatCircleDistance";
import type { FlightState } from "@/types/flight";
import type { GeoBounds } from "@/types/geo";

/** Odgovor `GET /v2/point/...` (ADSBExchange v2 oblik, api.adsb.one). */
export type AdsbOnePointResponse = {
  readonly ac?: readonly AdsbOneAircraft[] | null;
  readonly msg?: string;
  readonly now?: number;
};

export type AdsbOneAircraft = {
  readonly hex?: string;
  readonly flight?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly alt_baro?: number | string;
  readonly alt_geom?: number | string;
  readonly gs?: number;
  readonly track?: number;
  readonly category?: string;
  readonly seen?: number;
  readonly seen_pos?: number;
};

const FT_TO_M = 0.3048;
const KNOTS_TO_MPS = 0.514444;

function inBounds(lat: number, lng: number, b: GeoBounds): boolean {
  return (
    lat >= b.south &&
    lat <= b.north &&
    lng >= b.west &&
    lng <= b.east
  );
}

function altitudeFeetToMeters(
  raw: number | string | undefined
): number | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw === "string") {
    if (raw.toLowerCase() === "ground") {
      return null;
    }
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n * FT_TO_M : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw * FT_TO_M;
  }
  return null;
}

/**
 * Pretvara jedan zapis `ac` u {@link FlightState} ako ima valjane koordinate u okviru.
 */
export function adsbOneAircraftToFlightState(
  row: AdsbOneAircraft,
  viewBounds: GeoBounds,
  responseNowMs: number
): FlightState | null {
  const hexRaw = row.hex;
  if (typeof hexRaw !== "string" || hexRaw.length === 0) {
    return null;
  }
  const icao = hexRaw.toUpperCase();
  const lat = row.lat;
  const lon = row.lon;
  if (typeof lat !== "number" || typeof lon !== "number") {
    return null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (!inBounds(lat, lon, viewBounds)) {
    return null;
  }
  const callRaw = row.flight;
  const callSign =
    typeof callRaw === "string" ? callRaw.trim() || null : null;
  let airlineIcao: string | null = null;
  if (callSign && callSign.length >= 3) {
    const rawPrefix = callSign.slice(0, 3);
    if (/^[A-Za-z]{3}$/.test(rawPrefix)) {
      airlineIcao = rawPrefix.toUpperCase();
    }
  }
  const baro = altitudeFeetToMeters(row.alt_baro);
  const geo = altitudeFeetToMeters(row.alt_geom);
  const gs = row.gs;
  const groundSpeedMps =
    typeof gs === "number" && Number.isFinite(gs) ? gs * KNOTS_TO_MPS : null;
  const track = row.track;
  const trackDeg =
    typeof track === "number" && Number.isFinite(track)
      ? ((track % 360) + 360) % 360
      : null;
  const seenPos =
    typeof row.seen_pos === "number" && Number.isFinite(row.seen_pos)
      ? row.seen_pos
      : null;
  const seen =
    typeof row.seen === "number" && Number.isFinite(row.seen) ? row.seen : null;
  const ageSec = seenPos ?? seen ?? 0;
  const timestamp = Math.max(0, responseNowMs - ageSec * 1000);
  return {
    id: icao,
    icao24: icao,
    callSign,
    airlineIcao,
    position: { lat, lng: lon },
    baroAltitudeMeters: baro,
    geoAltitudeMeters: geo,
    groundSpeedMps,
    trackDeg,
    timestamp,
    /** ADSBExchange `category` strings (e.g. "A2") are not OpenSky emitter indices. */
    adsbEmitterCategory: null,
    aircraftType: null,
    airlineName: null,
  };
}

export function flightsFromAdsbOnePointResponse(
  data: AdsbOnePointResponse,
  viewBounds: GeoBounds
): readonly FlightState[] {
  const list = data.ac;
  if (!list || list.length === 0) {
    return [];
  }
  const nowMs =
    typeof data.now === "number" && Number.isFinite(data.now)
      ? data.now
      : Date.now();
  const out: FlightState[] = [];
  for (const row of list) {
    const f = adsbOneAircraftToFlightState(row, viewBounds, nowMs);
    if (f) {
      out.push(f);
    }
  }
  return out;
}

/** Polumjer (nm) koji pokriva pravokutnik `region` oko središta, za `/v2/point/`. */
export function radiusNmCoveringBounds(region: GeoBounds): number {
  const c = centerOfBounds(region);
  const corners: readonly [number, number][] = [
    [region.south, region.west],
    [region.south, region.east],
    [region.north, region.west],
    [region.north, region.east],
  ];
  let maxNm = 0;
  for (const [lat, lng] of corners) {
    maxNm = Math.max(
      maxNm,
      greatCircleDistanceNauticalMiles(c.lat, c.lng, lat, lng)
    );
  }
  const padded = maxNm * 1.03 + 0.5;
  return Math.min(250, Math.max(3, padded));
}

export function averageVelocityFromFlightsInRegion(
  flights: readonly FlightState[],
  region: GeoBounds
): { readonly avgSpeedMps: number; readonly sampleCount: number } | null {
  const speeds: number[] = [];
  for (const f of flights) {
    const { lat, lng } = f.position;
    if (!inBounds(lat, lng, region)) {
      continue;
    }
    const v = f.groundSpeedMps;
    if (v == null || !Number.isFinite(v)) {
      continue;
    }
    speeds.push(v);
  }
  if (speeds.length === 0) {
    return null;
  }
  const sum = speeds.reduce((a, b) => a + b, 0);
  return { avgSpeedMps: sum / speeds.length, sampleCount: speeds.length };
}
