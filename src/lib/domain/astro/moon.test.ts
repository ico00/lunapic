import { describe, expect, it } from "vitest";
import { getMoonState } from "./moon";

describe("getMoonState", () => {
  it("returns finite horizontal angles and positive apparent radius (regression shape)", () => {
    const m = getMoonState(new Date("2019-01-15T12:00:00.000Z"), 45.8, 15.98);
    expect(Number.isFinite(m.altitudeDeg)).toBe(true);
    expect(m.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(m.azimuthDeg).toBeLessThan(360);
    expect(m.apparentRadius.degrees).toBeGreaterThan(0.2);
    expect(m.apparentRadius.degrees).toBeLessThan(0.35);
    expect(m.distanceKm).toBeGreaterThan(300_000);
    expect(m.phaseFraction).toBeGreaterThanOrEqual(0);
    expect(m.phaseFraction).toBeLessThanOrEqual(1);
  });
});
