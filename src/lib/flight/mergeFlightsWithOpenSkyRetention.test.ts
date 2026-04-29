import {
  clearOpenSkyFlightRetention,
  mergeFlightsWithOpenSkyRetention,
} from "@/lib/flight/mergeFlightsWithOpenSkyRetention";
import type { FlightState } from "@/types/flight";
import { describe, expect, it, beforeEach } from "vitest";

const mapBounds = { south: 45, north: 47, west: 15, east: 17 };

const flight = (
  id: string,
  overrides: Partial<FlightState> = {}
): FlightState => ({
  id,
  icao24: id,
  callSign: null,
  originCountry: null,
  airlineIcao: null,
  adsbEmitterCategory: null,
  aircraftType: null,
  airlineName: null,
  position: { lat: 46, lng: 16 },
  baroAltitudeMeters: 10_000,
  geoAltitudeMeters: 10_000,
  groundSpeedMps: 200,
  trackDeg: 90,
  timestamp: 1_700_000_000_000,
  ...overrides,
});

describe("mergeFlightsWithOpenSkyRetention", () => {
  beforeEach(() => {
    clearOpenSkyFlightRetention();
  });

  it("retains OpenSky aircraft briefly missing from the next payload", () => {
    const t0 = 1_000_000;
    const prev: FlightState[] = [];
    const first = mergeFlightsWithOpenSkyRetention([flight("abc")], prev, {
      providerId: "opensky",
      mapBounds,
      nowMs: t0,
      openSkyLatencySkewMs: 0,
    });
    expect(first.map((f) => f.id)).toEqual(["abc"]);

    const second = mergeFlightsWithOpenSkyRetention([], first, {
      providerId: "opensky",
      mapBounds,
      nowMs: t0 + 10_000,
      openSkyLatencySkewMs: 0,
    });
    expect(second.map((f) => f.id)).toEqual(["abc"]);
  });

  it("drops retained aircraft after the retention window", () => {
    const t0 = 2_000_000;
    const first = mergeFlightsWithOpenSkyRetention([flight("abc")], [], {
      providerId: "opensky",
      mapBounds,
      nowMs: t0,
      openSkyLatencySkewMs: 0,
    });
    const second = mergeFlightsWithOpenSkyRetention([], first, {
      providerId: "opensky",
      mapBounds,
      nowMs: t0 + 35_000,
      openSkyLatencySkewMs: 0,
    });
    expect(second).toHaveLength(0);
  });

  it("does not retain when provider is not OpenSky", () => {
    const t0 = 3_000_000;
    const first = mergeFlightsWithOpenSkyRetention([flight("abc")], [], {
      providerId: "static",
      mapBounds,
      nowMs: t0,
      openSkyLatencySkewMs: 0,
    });
    const second = mergeFlightsWithOpenSkyRetention([], first, {
      providerId: "static",
      mapBounds,
      nowMs: t0 + 5_000,
      openSkyLatencySkewMs: 0,
    });
    expect(second).toHaveLength(0);
  });
});
