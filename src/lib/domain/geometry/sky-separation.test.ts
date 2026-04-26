import { describe, expect, it } from "vitest";
import { angularSeparationDeg } from "./sky-separation";

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
