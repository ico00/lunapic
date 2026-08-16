import { describe, expect, it } from "vitest";
import {
  getMoonPhaseGeometry,
  moonPhasePathD,
  moonPhaseRotationDeg,
} from "./moonPhaseGeometry";

/** Direction the lit side points on screen, after applying the SVG rotation to `+x`. */
function litDirection(rotationDeg: number): { x: number; y: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

describe("getMoonPhaseGeometry", () => {
  it("puts the bright limb west at first quarter and east at last quarter", () => {
    const firstQuarter = getMoonPhaseGeometry(new Date("2026-08-20T02:46:58Z"));
    expect(firstQuarter.illuminationFraction).toBeCloseTo(0.5, 2);
    expect(firstQuarter.brightLimbAngleDeg).toBeGreaterThan(240);
    expect(firstQuarter.brightLimbAngleDeg).toBeLessThan(300);

    const lastQuarter = getMoonPhaseGeometry(new Date("2026-09-04T07:51:42Z"));
    expect(lastQuarter.illuminationFraction).toBeCloseTo(0.5, 2);
    expect(lastQuarter.brightLimbAngleDeg).toBeGreaterThan(60);
    expect(lastQuarter.brightLimbAngleDeg).toBeLessThan(120);
  });

  it("reports a fully lit disk at full moon", () => {
    expect(
      getMoonPhaseGeometry(new Date("2026-08-28T04:19:06Z")).illuminationFraction
    ).toBeGreaterThan(0.99);
  });
});

describe("moonPhaseRotationDeg", () => {
  it("lights the right of the frame for a first quarter moon on the meridian", () => {
    // 2026-08-20 17:04 UT: Moon transits for a 45.8°N observer, so the parallactic
    // angle is ~0 and the equatorial limb angle carries straight into the frame.
    const { brightLimbAngleDeg } = getMoonPhaseGeometry(
      new Date("2026-08-20T17:04:41Z")
    );
    const direction = litDirection(
      moonPhaseRotationDeg(brightLimbAngleDeg, -0.064)
    );
    expect(direction.x).toBeGreaterThan(0.9);
  });

  it("lights the left of the frame for a last quarter moon on the meridian", () => {
    const { brightLimbAngleDeg } = getMoonPhaseGeometry(
      new Date("2026-09-04T07:51:42Z")
    );
    const direction = litDirection(moonPhaseRotationDeg(brightLimbAngleDeg, 0));
    expect(direction.x).toBeLessThan(-0.9);
  });

  it("rotates with the parallactic angle so the disk tracks the camera frame", () => {
    expect(moonPhaseRotationDeg(270, 0)).toBeCloseTo(0, 6);
    expect(moonPhaseRotationDeg(270, 90)).toBeCloseTo(90, 6);
  });
});

describe("moonPhasePathD", () => {
  const disk = { cx: 100, cy: 100, r: 50 };

  it("collapses the terminator to a straight edge at half illumination", () => {
    expect(moonPhasePathD({ ...disk, illuminationFraction: 0.5 })).toContain(
      "A 0 50 0 0 0"
    );
  });

  it("bulges the terminator toward the lit limb while crescent", () => {
    expect(moonPhasePathD({ ...disk, illuminationFraction: 0.25 })).toContain(
      "A 25 50 0 0 0"
    );
  });

  it("bulges the terminator away from the lit limb once gibbous", () => {
    expect(moonPhasePathD({ ...disk, illuminationFraction: 0.75 })).toContain(
      "A 25 50 0 0 1"
    );
  });

  it("traces the whole disk at full moon and nothing at new moon", () => {
    expect(moonPhasePathD({ ...disk, illuminationFraction: 1 })).toContain(
      "A 50 50 0 0 1"
    );
    expect(moonPhasePathD({ ...disk, illuminationFraction: 0 })).toContain(
      "A 50 50 0 0 0"
    );
  });

  it("clamps illumination outside [0, 1]", () => {
    expect(moonPhasePathD({ ...disk, illuminationFraction: 1.4 })).toBe(
      moonPhasePathD({ ...disk, illuminationFraction: 1 })
    );
    expect(moonPhasePathD({ ...disk, illuminationFraction: -0.2 })).toBe(
      moonPhasePathD({ ...disk, illuminationFraction: 0 })
    );
  });
});
