import { describe, expect, it } from "vitest";
import { computeShotFeasibleFlightIds } from "@/lib/domain/transit/computeShotFeasibleFlightIds";
import type { FlightState } from "@/types/flight";
import type { MoonState } from "@/types/moon";

const observer = { lat: 45.8, lng: 16.0, groundHeightMeters: 100 };

const moonAbove: MoonState = {
  altitudeDeg: 30,
  azimuthDeg: 180,
  distanceKm: 380_000,
  apparentRadius: { degrees: 0.25 },
  phaseFraction: 0.5,
  illuminationFraction: 1,
};

function flight(id: string, lat: number, lng: number): FlightState {
  return {
    id,
    callSign: id,
    position: { lat, lng },
    geoAltitudeMeters: 10_000,
    baroAltitudeMeters: null,
    groundSpeedMps: 200,
    trackDeg: 90,
    timestamp: Date.now(),
  };
}

describe("computeShotFeasibleFlightIds", () => {
  it("returns empty when moon is below horizon", () => {
    const moonLow: MoonState = {
      ...moonAbove,
      altitudeDeg: -2,
    };
    const out = computeShotFeasibleFlightIds(
      observer,
      moonLow,
      [flight("a", 45.81, 16.01)],
      400,
      "fullFrame"
    );
    expect(out.size).toBe(0);
  });
});
