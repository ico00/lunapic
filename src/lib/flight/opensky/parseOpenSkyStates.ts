import type { FlightState } from "@/types/flight";
import type { GeoBounds } from "@/types/geo";

export type OpenSkyStatesResponse = {
  readonly time: number;
  readonly states: readonly (readonly (string | number | boolean | null)[])[] | null;
};

function inBounds(
  lat: number,
  lng: number,
  b: GeoBounds
): boolean {
  return (
    lat >= b.south &&
    lat <= b.north &&
    lng >= b.west &&
    lng <= b.east
  );
}

/**
 * OpenSky — polja u istom redoslijedu kao u REST odgovoru.
 * @see https://openskynetwork.github.io/opensky-api/rest.html
 */
export function stateToFlightState(
  row: readonly (string | number | boolean | null)[],
  viewBounds: GeoBounds
): FlightState | null {
  const icao = row[0];
  if (typeof icao !== "string" || icao.length === 0) {
    return null;
  }
  const lon = row[5];
  const lat = row[6];
  if (typeof lon !== "number" || typeof lat !== "number") {
    return null;
  }
  if (!inBounds(lat, lon, viewBounds)) {
    return null;
  }
  const callsign =
    typeof row[1] === "string" ? row[1].trim() || null : null;
  const baro = row[7];
  const vel = row[9];
  const track = row[10];
  const timePos = row[3];
  const lastContact = row[4];
  const geoAlt = row[13];
  const tsSec =
    typeof timePos === "number"
      ? timePos
      : typeof lastContact === "number"
        ? lastContact
        : Math.floor(Date.now() / 1000);
  return {
    id: icao,
    icao24: icao,
    callSign: callsign,
    position: { lat, lng: lon },
    baroAltitudeMeters: typeof baro === "number" ? baro : null,
    geoAltitudeMeters: typeof geoAlt === "number" ? geoAlt : null,
    groundSpeedMps: typeof vel === "number" ? vel : null,
    trackDeg:
      typeof track === "number" && Number.isFinite(track)
        ? ((track % 360) + 360) % 360
        : null,
    timestamp: tsSec * 1000,
  };
}

export function flightsFromOpenSkyResponse(
  data: OpenSkyStatesResponse,
  viewBounds: GeoBounds
): readonly FlightState[] {
  if (!data.states) {
    return [];
  }
  const out: FlightState[] = [];
  for (const row of data.states) {
    if (row[8] === true) {
      continue;
    }
    const f = stateToFlightState(row, viewBounds);
    if (f) {
      out.push(f);
    }
  }
  return out;
}

export function averageVelocityMpsInRegion(
  data: OpenSkyStatesResponse,
  regionBounds: GeoBounds
): { readonly avgSpeedMps: number; readonly sampleCount: number } | null {
  if (!data.states) {
    return null;
  }
  const speeds: number[] = [];
  for (const row of data.states) {
    const lon = row[5];
    const lat = row[6];
    const onGround = row[8] === true;
    const vel = row[9];
    if (
      typeof lon !== "number" ||
      typeof lat !== "number" ||
      onGround ||
      typeof vel !== "number" ||
      !Number.isFinite(vel)
    ) {
      continue;
    }
    if (!inBounds(lat, lon, regionBounds)) {
      continue;
    }
    speeds.push(vel);
  }
  if (speeds.length === 0) {
    return null;
  }
  const sum = speeds.reduce((a, b) => a + b, 0);
  return {
    avgSpeedMps: sum / speeds.length,
    sampleCount: speeds.length,
  };
}
