import { describe, expect, it } from "vitest";
import {
  APPROACH_EXTENSION_METERS,
  LDZA_RUNWAY_04_22_LINE,
  buildApproachExtensionTips,
  initialBearingDeg,
} from "./airportRunwayConfig";

const EARTH_RADIUS_M = 6371008.8;

/** Haversine great-circle distance, metres — independent of the code under test. */
function distanceMeters(
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const RWY22_THRESHOLD = LDZA_RUNWAY_04_22_LINE[0]!;
const RWY04_THRESHOLD =
  LDZA_RUNWAY_04_22_LINE[LDZA_RUNWAY_04_22_LINE.length - 1]!;

describe("initialBearingDeg", () => {
  it("returns the cardinal directions from the equator", () => {
    expect(initialBearingDeg([0, 0], [1, 0])).toBeCloseTo(0, 9);
    expect(initialBearingDeg([0, 0], [0, 1])).toBeCloseTo(90, 9);
    expect(initialBearingDeg([0, 0], [-1, 0])).toBeCloseTo(180, 9);
    expect(initialBearingDeg([0, 0], [0, -1])).toBeCloseTo(270, 9);
  });

  it("normalizes westward bearings into [0, 360) rather than returning negatives", () => {
    const bearing = initialBearingDeg([45, 16], [45, 15]);
    expect(bearing).toBeGreaterThan(180);
    expect(bearing).toBeLessThan(360);
  });

  it("is a great-circle initial bearing, not a rhumb line", () => {
    // Due east on a rhumb line is 90°; the great circle from 45°N starts north
    // of that and curves back. A rhumb implementation would return exactly 90.
    expect(initialBearingDeg([45, 0], [45, 10])).toBeCloseTo(86.46, 2);
    expect(initialBearingDeg([45, 0], [45, 10])).toBeLessThan(90);
  });

  it("matches the LDZA pavement bearing the config was built to preserve", () => {
    // The doc block cites ~47° as the real pavement bearing; an earlier
    // straight-line version produced ~50° and sat visibly off the runway.
    expect(initialBearingDeg(RWY04_THRESHOLD, RWY22_THRESHOLD)).toBeCloseTo(
      46.74,
      2
    );
    expect(initialBearingDeg(RWY22_THRESHOLD, RWY04_THRESHOLD)).toBeCloseTo(
      226.76,
      2
    );
  });

  it("is antisymmetric to within the great-circle convergence at this latitude", () => {
    const forward = initialBearingDeg(RWY22_THRESHOLD, RWY04_THRESHOLD);
    const back = initialBearingDeg(RWY04_THRESHOLD, RWY22_THRESHOLD);
    expect(Math.abs(forward - back)).toBeCloseTo(180, 1);
  });
});

describe("buildApproachExtensionTips", () => {
  const { rwy22Ext, rwy04Ext } = buildApproachExtensionTips();
  const tip22: [number, number] = [rwy22Ext.lat, rwy22Ext.lng];
  const tip04: [number, number] = [rwy04Ext.lat, rwy04Ext.lng];

  it("places each tip APPROACH_EXTENSION_METERS from its own threshold", () => {
    expect(distanceMeters(RWY22_THRESHOLD, tip22)).toBeCloseTo(
      APPROACH_EXTENSION_METERS,
      0
    );
    expect(distanceMeters(RWY04_THRESHOLD, tip04)).toBeCloseTo(
      APPROACH_EXTENSION_METERS,
      0
    );
  });

  it("extends outward past each threshold, not back across the pavement", () => {
    const pavementLength = distanceMeters(RWY22_THRESHOLD, RWY04_THRESHOLD);
    // A tip pointing the wrong way would land inside the runway, leaving it
    // closer to the far threshold than the pavement is long.
    expect(distanceMeters(tip22, RWY04_THRESHOLD)).toBeCloseTo(
      pavementLength + APPROACH_EXTENSION_METERS,
      0
    );
    expect(distanceMeters(tip04, RWY22_THRESHOLD)).toBeCloseTo(
      pavementLength + APPROACH_EXTENSION_METERS,
      0
    );
  });

  it("stays collinear with the terminal pavement segment at each end", () => {
    // Bearing is taken from the last segment, not threshold-to-threshold, so a
    // slightly kinked OSM way still leaves the extension on the real centerline.
    expect(initialBearingDeg(RWY22_THRESHOLD, tip22)).toBeCloseTo(
      initialBearingDeg(LDZA_RUNWAY_04_22_LINE[1]!, RWY22_THRESHOLD),
      3
    );
    expect(initialBearingDeg(RWY04_THRESHOLD, tip04)).toBeCloseTo(
      initialBearingDeg(
        LDZA_RUNWAY_04_22_LINE[LDZA_RUNWAY_04_22_LINE.length - 2]!,
        RWY04_THRESHOLD
      ),
      3
    );
  });

  it("sends the two tips to opposite ends of the runway axis", () => {
    expect(distanceMeters(tip22, tip04)).toBeCloseTo(
      distanceMeters(RWY22_THRESHOLD, RWY04_THRESHOLD) +
        2 * APPROACH_EXTENSION_METERS,
      0
    );
  });
});
