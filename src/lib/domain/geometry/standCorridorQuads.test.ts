import {
  buildStandCorridorSpineLineFeature,
  buildStandCorridorStripFeatures,
  normBearing360,
} from "./standCorridorQuads";
import { describe, expect, it } from "vitest";

describe("buildStandCorridorStripFeatures", () => {
  it("makes a valid closed ring for one sample (stand bearing = moon + 180)", () => {
    const mAz = 270;
    const gLat = 45.8;
    const gLng = 16.0;
    const standBearingDeg = normBearing360(mAz + 180);
    const feats = buildStandCorridorStripFeatures(
      [{ groundLat: gLat, groundLng: gLng, standBearingDeg }],
      { nearAlongM: 1_000, farAlongM: 5_000, halfWidthM: 1_200 }
    );
    expect(feats).toHaveLength(1);
    const ring = feats[0]!.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBeGreaterThanOrEqual(4);
  });

  it("emits one polygon per sample (multi-sample path)", () => {
    const samples = Array.from({ length: 3 }, (_, j) => ({
      groundLat: 45,
      groundLng: 16,
      standBearingDeg: normBearing360(60 * j + 10),
    }));
    const feats = buildStandCorridorStripFeatures(samples, {
      nearAlongM: 500,
      farAlongM: 2_000,
      halfWidthM: 500,
    });
    expect(feats).toHaveLength(3);
  });
});

describe("buildStandCorridorSpineLineFeature", () => {
  it("is a 2-vertex line along the trapezoid center", () => {
    const s = { groundLat: 45, groundLng: 16, standBearingDeg: 90 };
    const f = buildStandCorridorSpineLineFeature(s, {
      nearAlongM: 500,
      farAlongM: 2_000,
      halfWidthM: 0,
    });
    expect(f.geometry.type).toBe("LineString");
    expect(f.geometry.coordinates).toHaveLength(2);
  });
});
