import { describe, expect, it } from "vitest";
import { angularSeparationDeg, closestApproachOnArc } from "./sky-separation";

describe("angularSeparationDeg", () => {
  it("identical directions → 0", () => {
    const p = { altitudeDeg: 30, azimuthDeg: 120 };
    expect(angularSeparationDeg(p, p)).toBeCloseTo(0, 10);
  });

  it("90° apart on horizon", () => {
    const a = { altitudeDeg: 0, azimuthDeg: 0 };
    const b = { altitudeDeg: 0, azimuthDeg: 90 };
    expect(angularSeparationDeg(a, b)).toBeCloseTo(90, 5);
  });

  it("antipodal on horizon → 180°", () => {
    const a = { altitudeDeg: 0, azimuthDeg: 0 };
    const b = { altitudeDeg: 0, azimuthDeg: 180 };
    expect(angularSeparationDeg(a, b)).toBeCloseTo(180, 5);
  });
});

describe("closestApproachOnArc", () => {
  it("finds a crossing between two samples that are both far from the target", () => {
    const hit = closestApproachOnArc(
      { altitudeDeg: 30, azimuthDeg: 175 },
      { altitudeDeg: 30, azimuthDeg: 185 },
      { altitudeDeg: 30, azimuthDeg: 180 }
    );
    // Veliki krug između dvije točke iste visine prolazi malo iznad njih.
    expect(hit.separationDeg).toBeLessThan(0.1);
    expect(hit.fraction).toBeCloseTo(0.5, 3);
  });

  it("stops at the nearer end when the target is past the arc", () => {
    const hit = closestApproachOnArc(
      { altitudeDeg: 30, azimuthDeg: 170 },
      { altitudeDeg: 30, azimuthDeg: 175 },
      { altitudeDeg: 30, azimuthDeg: 180 }
    );
    expect(hit.fraction).toBe(1);
    expect(hit.separationDeg).toBeCloseTo(4.33, 1);
  });

  it("works through the zenith and across north", () => {
    const zenith = closestApproachOnArc(
      { altitudeDeg: 85, azimuthDeg: 90 },
      { altitudeDeg: 85, azimuthDeg: 270 },
      { altitudeDeg: 89, azimuthDeg: 0 }
    );
    expect(zenith.separationDeg).toBeCloseTo(1, 1);
    const north = closestApproachOnArc(
      { altitudeDeg: 20, azimuthDeg: 358 },
      { altitudeDeg: 20, azimuthDeg: 2 },
      { altitudeDeg: 20, azimuthDeg: 0 }
    );
    expect(north.separationDeg).toBeLessThan(0.05);
  });

  it("handles a stationary track", () => {
    const point = { altitudeDeg: 40, azimuthDeg: 120 };
    expect(closestApproachOnArc(point, point, { altitudeDeg: 41, azimuthDeg: 120 })).toEqual({
      separationDeg: expect.closeTo(1, 5),
      fraction: 0,
    });
  });
});
