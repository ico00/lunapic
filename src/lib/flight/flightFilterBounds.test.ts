import { describe, expect, it } from "vitest";

import { flightFilterBounds, TRANSIT_SCREENING_RADIUS_KM } from "./flightFilterBounds";
import { MAX_ALIGNMENT_LOOKAHEAD_SEC } from "@/lib/domain/geometry/lineOfSightKinematics";
import { flightsFromLocalSdrResponse } from "@/lib/flight/localsdr/parseLocalSdrAircraft";

/** Zumirani viewport oko promatrača — ~5 km široko. */
const ZOOMED_VIEWPORT = {
  south: 45.79,
  north: 45.83,
  west: 15.95,
  east: 16.03,
};
const OBSERVER = { lat: 45.81, lng: 15.99, groundHeightMeters: 120 };

describe("flightFilterBounds", () => {
  it("proširuje zumirani viewport na disk oko promatrača", () => {
    const b = flightFilterBounds({ bounds: ZOOMED_VIEWPORT, observer: OBSERVER });
    expect(b.north).toBeGreaterThan(ZOOMED_VIEWPORT.north + 0.5);
    expect(b.south).toBeLessThan(ZOOMED_VIEWPORT.south - 0.5);
  });

  it("doseže avion koji do tranzita na 100 km stigne unutar horizonta predviđanja", () => {
    const fastCruiseMps = 270;
    expect(TRANSIT_SCREENING_RADIUS_KM).toBeGreaterThanOrEqual(
      100 + (MAX_ALIGNMENT_LOOKAHEAD_SEC * fastCruiseMps) / 1000
    );
    // ~150 km sjeverno od promatrača: izvan starih 100 km, unutar novog diska.
    const b = flightFilterBounds({ bounds: ZOOMED_VIEWPORT, observer: OBSERVER });
    expect(b.north).toBeGreaterThan(OBSERVER.lat + 1.35);
  });

  it("nikad ne odsijeca ono što je viewport već pokrivao", () => {
    const wide = { south: 40, north: 50, west: 10, east: 20 };
    const b = flightFilterBounds({ bounds: wide, observer: OBSERVER });
    expect(b.south).toBeLessThanOrEqual(wide.south);
    expect(b.north).toBeGreaterThanOrEqual(wide.north);
    expect(b.west).toBeLessThanOrEqual(wide.west);
    expect(b.east).toBeGreaterThanOrEqual(wide.east);
  });

  it("lokalni prijemnik zadržava avion izvan zumiranog viewporta (regresija: nestajanje pri zumiranju)", () => {
    // ~55 km sjeverno od promatrača — daleko izvan viewporta, unutar diska.
    const snapshot = {
      now: 1_787_679_723,
      aircraft: [
        {
          hex: "4d2455",
          flight: "WZZ359  ",
          alt_baro: 37_000,
          gs: 430,
          track: 215,
          lat: 46.31,
          lon: 15.99,
          seen_pos: 0.4,
        },
      ],
    };
    const query = { bounds: ZOOMED_VIEWPORT, observer: OBSERVER };

    expect(flightsFromLocalSdrResponse(snapshot, query.bounds)).toHaveLength(0);
    expect(
      flightsFromLocalSdrResponse(snapshot, flightFilterBounds(query))
    ).toHaveLength(1);
  });
});
