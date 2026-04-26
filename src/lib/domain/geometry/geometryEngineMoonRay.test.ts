import { describe, expect, it } from "vitest";
import { buildMoonAzimuthLine, buildMoonPathLineCoordinates } from "./geometryEngineMoonRay";

describe("geometryEngineMoonRay", () => {
  it("buildMoonAzimuthLine: end point lies ahead of observer along azimuth (north here)", () => {
    const observer = { lat: 45.8, lng: 15.98 };
    const [a, b] = buildMoonAzimuthLine(observer, { azimuthDeg: 0 }, 20_000);
    expect(b.lat).toBeGreaterThan(a.lat);
    expect(b.lng).toBeCloseTo(a.lng, 2);
  });

  it("buildMoonPathLineCoordinates: < 2 samples → []", () => {
    const observer = { lat: 0, lng: 0 };
    expect(
      buildMoonPathLineCoordinates(observer, [{ azimuthDeg: 0 }], 1000)
    ).toEqual([]);
  });

  it("buildMoonPathLineCoordinates: one coordinate pair per sample", () => {
    const observer = { lat: 10, lng: 20 };
    const line = buildMoonPathLineCoordinates(
      observer,
      [
        { azimuthDeg: 0 },
        { azimuthDeg: 90 },
      ],
      5000
    );
    expect(line).toHaveLength(2);
    expect(line[0]![0]).toBeTypeOf("number");
    expect(line[0]![1]).toBeTypeOf("number");
  });
});
