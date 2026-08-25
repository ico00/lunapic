import { describe, expect, it } from "vitest";
import { computeActiveTransits } from "./computeActiveTransits";
import type { FlightState } from "@/types/flight";

const observer = { lat: 45.8, lng: 15.98, groundHeightMeters: 0 };

const MOON_UP = new Date("2019-01-15T18:00:00.000Z"); // alt 54.4°, az 178.4° (S)
const MOON_DOWN = new Date("2019-01-15T06:00:00.000Z"); // alt -35.8°

// Avion daleko sjeverno od promatrača — daleko od Mjeseca (koji je na jugu).
const farFlight: FlightState = {
  id: "far1",
  position: { lat: 46.6, lng: 15.98 },
  baroAltitudeMeters: null,
  geoAltitudeMeters: 10_000,
  groundSpeedMps: 200,
  trackDeg: 90,
  timestamp: MOON_UP.getTime(),
};

const baseArgs = {
  observer,
  wallNowMs: MOON_UP.getTime(),
  latencySkewMs: 0,
};

describe("computeActiveTransits", () => {
  it("returns empty when there are no flights", () => {
    expect(
      computeActiveTransits({ ...baseArgs, flights: [], at: MOON_UP })
    ).toEqual([]);
  });

  it("returns empty when the moon is below the critical altitude", () => {
    expect(
      computeActiveTransits({
        ...baseArgs,
        flights: [farFlight],
        at: MOON_DOWN,
        wallNowMs: MOON_DOWN.getTime(),
      })
    ).toEqual([]);
  });

  it("does not flag a flight far from the moon as an active transit", () => {
    expect(
      computeActiveTransits({ ...baseArgs, flights: [farFlight], at: MOON_UP })
    ).toEqual([]);
  });

  it("ne okida alert iz zamrznute pozicije (fix stariji od granice ekstrapolacije)", () => {
    // Avion točno na Mjesecu, ali s fixom starim 2 min — marker je davno stao,
    // pa bi svaki alert bio lažan.
    const onMoon: FlightState = {
      ...farFlight,
      id: "stale1",
      position: { lat: 45.3, lng: 15.98 },
      trackDeg: 180,
    };
    const fresh = computeActiveTransits({
      ...baseArgs,
      flights: [onMoon],
      at: MOON_UP,
    });
    const stale = computeActiveTransits({
      ...baseArgs,
      flights: [{ ...onMoon, timestamp: MOON_UP.getTime() - 120_000 }],
      at: MOON_UP,
    });
    expect(stale).toEqual([]);
    expect(stale.length).toBeLessThanOrEqual(fresh.length);
  });
});
