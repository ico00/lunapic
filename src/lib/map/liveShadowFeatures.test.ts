import { describe, expect, it } from "vitest";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import { initialBearingDeg } from "@/lib/domain/geometry/wgs84";
import { buildToleranceEllipseRing } from "./liveShadowFeatures";

const LAT = 45.83;
const LNG = 16.08;
const MOON_AZ = 140;

describe("buildToleranceEllipseRing", () => {
  it("is widest along the Moon's azimuth and narrowest across it", () => {
    const ring = buildToleranceEllipseRing(LAT, LNG, MOON_AZ, 26, 182);
    const distances = ring.map(([lng, lat]) => greatCircleDistanceMeters(LAT, LNG, lat, lng));
    expect(Math.max(...distances)).toBeCloseTo(182, -1);
    expect(Math.min(...distances)).toBeCloseTo(26, -1);
  });

  it("puts its long axis on the Moon's bearing", () => {
    const ring = buildToleranceEllipseRing(LAT, LNG, MOON_AZ, 26, 182);
    const farthest = ring.reduce((a, b) =>
      greatCircleDistanceMeters(LAT, LNG, b[1], b[0]) > greatCircleDistanceMeters(LAT, LNG, a[1], a[0]) ? b : a
    );
    const bearing = initialBearingDeg([LAT, LNG], [farthest[1], farthest[0]]);
    // Either end of the long axis is fine — it is an axis, not a direction.
    const delta = Math.abs(((bearing - MOON_AZ + 540) % 180));
    expect(Math.min(delta, 180 - delta)).toBeLessThan(2);
  });

  it("closes the ring", () => {
    const ring = buildToleranceEllipseRing(LAT, LNG, MOON_AZ, 26, 182);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});
