import { describe, expect, it } from "vitest";
import { horizontalToPoint } from "./horizontal";

describe("horizontalToPoint", () => {
  it("azimuth ≈ 0° for target due north of observer on same meridian", () => {
    const observer = { lat: 0, lng: 20, groundHeightMeters: 0 };
    const h = horizontalToPoint(observer, 0.1, 20, 0);
    expect(h.azimuthDeg).toBeCloseTo(0, 0);
  });

  it("azimuth ≈ 90° for target due east", () => {
    const observer = { lat: 0, lng: 20, groundHeightMeters: 0 };
    const h = horizontalToPoint(observer, 0, 20.1, 0);
    expect(h.azimuthDeg).toBeCloseTo(90, 0);
  });

  it("altitude increases for higher aircraft at same map position", () => {
    const observer = { lat: 45, lng: 16, groundHeightMeters: 0 };
    const low = horizontalToPoint(observer, 45.05, 16, 2000);
    const high = horizontalToPoint(observer, 45.05, 16, 12_000);
    expect(high.altitudeDeg).toBeGreaterThan(low.altitudeDeg);
  });
});
