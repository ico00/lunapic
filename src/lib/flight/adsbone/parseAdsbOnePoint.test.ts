import { describe, expect, it } from "vitest";
import {
  adsbOneAircraftToFlightState,
  flightsFromAdsbOnePointResponse,
  radiusNmCoveringBounds,
} from "./parseAdsbOnePoint";

describe("parseAdsbOnePoint", () => {
  const view = {
    south: 36,
    north: 39,
    west: -95,
    east: -91,
  };

  it("maps README sample to FlightState (feet and knots converted)", () => {
    const row = {
      hex: "a9cee9",
      type: "adsb_icao",
      flight: "N731BP  ",
      alt_baro: 38000,
      alt_geom: 38275,
      gs: 338.9,
      track: 276.1,
      lat: 37.358322,
      lon: -93.374147,
      category: "A2",
      seen_pos: 3.486,
      seen: 0.7,
    };
    const now = 1_675_633_671_226;
    const f = adsbOneAircraftToFlightState(row, view, now);
    expect(f).not.toBeNull();
    expect(f!.id).toBe("A9CEE9");
    expect(f!.callSign).toBe("N731BP");
    expect(f!.position.lat).toBeCloseTo(37.358322, 5);
    expect(f!.baroAltitudeMeters).toBeCloseTo(38000 * 0.3048, 1);
    expect(f!.groundSpeedMps).toBeCloseTo(338.9 * 0.514444, 2);
    expect(f!.trackDeg).toBeCloseTo(276.1, 3);
    expect(f!.adsbEmitterCategory).toBeNull();
    expect(f!.timestamp).toBeCloseTo(now - 3.486 * 1000, 0);
  });

  it("returns empty when ac missing", () => {
    expect(
      flightsFromAdsbOnePointResponse({ now: 0 }, view)
    ).toEqual([]);
  });

  it("radiusNmCoveringBounds stays within API cap", () => {
    const region = {
      south: 45.7,
      north: 45.9,
      west: 15.9,
      east: 16.2,
    };
    const r = radiusNmCoveringBounds(region);
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThanOrEqual(250);
  });
});
