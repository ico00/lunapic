import { canonicalIcao24Id } from "@/lib/flight/icao24CanonicalId";
import type { FlightState } from "@/types/flight";
import type { GeoBounds } from "@/types/geo";

/** dump1090 / readsb `GET /data/aircraft.json` response shape. */
export type LocalSdrResponse = {
  readonly now?: number;
  readonly aircraft?: readonly LocalSdrAircraft[];
};

export type LocalSdrAircraft = {
  readonly hex?: string;
  readonly flight?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly alt_baro?: number | string;
  readonly alt_geom?: number | string;
  readonly gs?: number;
  readonly track?: number;
  readonly seen_pos?: number;
  readonly seen?: number;
  /** Aircraft type ICAO designator (readsb only). */
  readonly t?: string;
  /** Aircraft registration (readsb with database). */
  readonly r?: string;
  /** Squawk transponder code. */
  readonly squawk?: string;
  /** Barometric vertical rate, ft/min. */
  readonly baro_rate?: number;
  /** Geometric vertical rate, ft/min. */
  readonly geom_rate?: number;
  /** ADS-B emitter category (readsb). */
  readonly category?: string;
  /** Signal strength dBFS (readsb). */
  readonly rssi?: number;
  /** Aircraft description from readsb database. */
  readonly desc?: string;
  /** True if on ground. */
  readonly ground?: boolean;
};

const FT_TO_M = 0.3048;
const KNOTS_TO_MPS = 0.514444;

function altFtToM(raw: number | string | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    if (raw.toLowerCase() === "ground") return null;
    const n = parseFloat(raw);
    return isFinite(n) ? n * FT_TO_M : null;
  }
  return isFinite(raw) ? raw * FT_TO_M : null;
}

function inBounds(lat: number, lng: number, b: GeoBounds): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

export function localSdrAircraftToFlightState(
  row: LocalSdrAircraft,
  nowMs: number,
  bounds?: GeoBounds
): FlightState | null {
  const hexRaw = row.hex;
  if (typeof hexRaw !== "string" || !hexRaw) return null;

  const lat = row.lat;
  const lon = row.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (bounds && !inBounds(lat, lon, bounds)) return null;

  const icao = canonicalIcao24Id(hexRaw);

  const callRaw = row.flight;
  const callSign = typeof callRaw === "string" ? callRaw.trim() || null : null;

  let airlineIcao: string | null = null;
  if (callSign && callSign.length >= 3) {
    const prefix = callSign.slice(0, 3);
    if (/^[A-Za-z]{3}$/.test(prefix)) airlineIcao = prefix.toUpperCase();
  }

  const ageSec =
    typeof row.seen_pos === "number" && isFinite(row.seen_pos)
      ? row.seen_pos
      : typeof row.seen === "number" && isFinite(row.seen)
        ? row.seen
        : 0;
  const timestamp = Math.max(0, nowMs - ageSec * 1000);

  const gs = row.gs;
  const groundSpeedMps =
    typeof gs === "number" && isFinite(gs) ? gs * KNOTS_TO_MPS : null;

  const track = row.track;
  const trackDeg =
    typeof track === "number" && isFinite(track)
      ? ((track % 360) + 360) % 360
      : null;

  const aircraftType =
    typeof row.t === "string" && row.t.trim() ? row.t.trim() : null;

  const registration =
    typeof row.r === "string" && row.r.trim() ? row.r.trim() : null;

  const squawk =
    typeof row.squawk === "string" && row.squawk.trim()
      ? row.squawk.trim()
      : null;

  const verticalRateFpm =
    typeof row.baro_rate === "number" && isFinite(row.baro_rate)
      ? row.baro_rate
      : typeof row.geom_rate === "number" && isFinite(row.geom_rate)
        ? row.geom_rate
        : null;

  const rssi =
    typeof row.rssi === "number" && isFinite(row.rssi) ? row.rssi : null;

  const aircraftDescription =
    typeof row.desc === "string" && row.desc.trim() ? row.desc.trim() : null;

  return {
    id: icao,
    icao24: icao,
    callSign,
    airlineIcao,
    position: { lat, lng: lon },
    baroAltitudeMeters: altFtToM(row.alt_baro),
    geoAltitudeMeters: altFtToM(row.alt_geom),
    groundSpeedMps,
    trackDeg,
    timestamp,
    adsbEmitterCategory: null,
    aircraftType,
    airlineName: null,
    registration,
    squawk,
    verticalRateFpm,
    rssi,
    aircraftDescription,
  };
}

export function flightsFromLocalSdrResponse(
  data: LocalSdrResponse,
  bounds?: GeoBounds
): readonly FlightState[] {
  const list = data.aircraft;
  if (!list || list.length === 0) return [];
  const nowMs =
    typeof data.now === "number" && isFinite(data.now)
      ? data.now * 1000
      : Date.now();
  const out: FlightState[] = [];
  for (const row of list) {
    const f = localSdrAircraftToFlightState(row, nowMs, bounds);
    if (f) out.push({ ...f, providerId: "localsdr" });
  }
  return out;
}
