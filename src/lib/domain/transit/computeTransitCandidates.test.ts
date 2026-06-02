import { describe, expect, it } from "vitest";
import { computeTransitCandidates } from "./computeTransitCandidates";
import type { FlightState } from "@/types/flight";

const observer = { lat: 45.8, lng: 15.98, groundHeightMeters: 0 };

// Mjesec visoko (alt 54.4°) — optimalan; vidi probe u sesiji.
const MOON_UP = new Date("2019-01-15T18:00:00.000Z");
// Mjesec duboko ispod horizonta (alt -35.8°) — ispod CRITICAL_BELOW_DEG.
const MOON_DOWN = new Date("2019-01-15T06:00:00.000Z");

const flight: FlightState = {
  id: "abc123",
  position: { lat: 45.9, lng: 15.98 },
  baroAltitudeMeters: null,
  geoAltitudeMeters: 10_000,
  groundSpeedMps: 200,
  trackDeg: 90,
  timestamp: MOON_UP.getTime(),
};

const baseArgs = {
  observer,
  focalLengthMm: 600,
  sensorType: "fullFrame" as const,
  wallNowMs: MOON_UP.getTime(),
  latencySkewMs: 0,
};

describe("computeTransitCandidates", () => {
  it("returns empty when there are no flights", () => {
    expect(
      computeTransitCandidates({ ...baseArgs, flights: [], at: MOON_UP })
    ).toEqual([]);
  });

  it("returns empty when the moon is below the critical altitude", () => {
    expect(
      computeTransitCandidates({
        ...baseArgs,
        flights: [flight],
        at: MOON_DOWN,
        wallNowMs: MOON_DOWN.getTime(),
      })
    ).toEqual([]);
  });
});
