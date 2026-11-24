import {
  clearOpenSkyFlightRetention,
  mergeFlightsWithOpenSkyRetention,
} from "@/lib/flight/mergeFlightsWithOpenSkyRetention";
import type { FlightState } from "@/types/flight";
import { describe, expect, it, beforeEach } from "vitest";

const filterBounds = { south: 45, north: 47, west: 15, east: 17 };

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
      filterBounds,
      nowMs: t0,
      openSkyLatencySkewMs: 0,
    });
    expect(first.map((f) => f.id)).toEqual(["abc"]);

    const second = mergeFlightsWithOpenSkyRetention([], first, {
      providerId: "opensky",
      filterBounds,
      nowMs: t0 + 10_000,
      openSkyLatencySkewMs: 0,
    });
    expect(second.map((f) => f.id)).toEqual(["abc"]);
  });

  it("drops retained aircraft after the retention window", () => {
    const t0 = 2_000_000;
    const first = mergeFlightsWithOpenSkyRetention([flight("abc")], [], {
      providerId: "opensky",
      filterBounds,
      nowMs: t0,
      openSkyLatencySkewMs: 0,
    });
    const second = mergeFlightsWithOpenSkyRetention([], first, {
      providerId: "opensky",
      filterBounds,
      nowMs: t0 + 35_000,
      openSkyLatencySkewMs: 0,
    });
    expect(second).toHaveLength(0);
  });

  it("does not retain when provider is not OpenSky", () => {
    const t0 = 3_000_000;
    const first = mergeFlightsWithOpenSkyRetention([flight("abc")], [], {
      providerId: "static",
      filterBounds,
      nowMs: t0,
      openSkyLatencySkewMs: 0,
    });
    const second = mergeFlightsWithOpenSkyRetention([], first, {
      providerId: "static",
      filterBounds,
      nowMs: t0 + 5_000,
      openSkyLatencySkewMs: 0,
    });
    expect(second).toHaveLength(0);
  });
});

describe("mergeFlightsWithOpenSkyRetention — position-only rows (Pi, 2026-11-24)", () => {
  const ctx = (nowMs: number) => ({
    providerId: "localsdr" as const,
    filterBounds,
    nowMs,
    openSkyLatencySkewMs: 0,
  });

  it("keeps the last reported heading and speed on a full tick", () => {
    const t0 = 1_700_000_000_000;
    const prev = [flight("abc", { timestamp: t0, trackDeg: 117, groundSpeedMps: 230 })];
    const [out] = mergeFlightsWithOpenSkyRetention(
      [flight("abc", { timestamp: t0 + 30_000, trackDeg: null, groundSpeedMps: null })],
      prev,
      ctx(t0 + 30_000)
    );
    expect(out.trackDeg).toBe(117);
    expect(out.groundSpeedMps).toBe(230);
    expect(out.kinematicsAtMs).toBe(t0);
  });

  it("stops borrowing once the heading itself is older than 60 s, even if positions kept coming", () => {
    const t0 = 1_700_000_000_000;
    let flights: readonly FlightState[] = [
      flight("abc", { timestamp: t0, trackDeg: 117, groundSpeedMps: 230 }),
    ];
    for (const dt of [30_000, 55_000, 65_000]) {
      flights = mergeFlightsWithOpenSkyRetention(
        [flight("abc", { timestamp: t0 + dt, trackDeg: null, groundSpeedMps: null })],
        flights,
        ctx(t0 + dt)
      );
      expect(flights[0].trackDeg).toBe(dt <= 60_000 ? 117 : null);
    }
  });
});
