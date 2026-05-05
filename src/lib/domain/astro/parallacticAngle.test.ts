import { describe, expect, it } from "vitest";
import {
  getMoonParallacticAngleDeg,
  normalizeSignedDeg,
} from "./parallacticAngle";

describe("getMoonParallacticAngleDeg", () => {
  it("normalizes angles to signed [-180, 180] range", () => {
    expect(normalizeSignedDeg(190)).toBeCloseTo(-170, 8);
    expect(normalizeSignedDeg(-190)).toBeCloseTo(170, 8);
    expect(normalizeSignedDeg(-180)).toBe(180);
  });

  it("returns finite angle for real observer/time inputs", () => {
    const angleDeg = getMoonParallacticAngleDeg(
      new Date(Date.UTC(2026, 4, 5, 17, 45, 0)),
      45.82968,
      16.06368
    );
    expect(Number.isFinite(angleDeg)).toBe(true);
    expect(angleDeg).toBeGreaterThanOrEqual(-180);
    expect(angleDeg).toBeLessThanOrEqual(180);
  });
});
