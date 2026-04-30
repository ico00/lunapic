import { describe, expect, it } from "vitest";
import {
  aircraftAngularSizeDeg,
  classifyShotFeasibility,
  effectiveFocalLengthMm,
  maxShotRangeMetersForCamera,
  moonCoveragePercent,
} from "./shotFeasibility";

describe("shotFeasibility", () => {
  it("computes effective focal by crop factor", () => {
    expect(effectiveFocalLengthMm(600, "fullFrame")).toBe(600);
    expect(effectiveFocalLengthMm(600, "apsC")).toBe(900);
    expect(effectiveFocalLengthMm(600, "microFourThirds")).toBe(1200);
  });

  it("computes angular size and moon coverage", () => {
    const theta = aircraftAngularSizeDeg(40, 100_000);
    expect(theta).toBeGreaterThan(0);
    const coverage = moonCoveragePercent(theta);
    expect(coverage).toBeGreaterThan(0);
  });

  it("scales map optical reach from baseline camera", () => {
    expect(maxShotRangeMetersForCamera(600, "fullFrame")).toBeCloseTo(120_000, 3);
    expect(maxShotRangeMetersForCamera(600, "apsC")).toBeCloseTo(180_000, 3);
  });

  it("classifies excellent / fair / poor", () => {
    expect(classifyShotFeasibility(70_000, 12)).toBe("excellent");
    expect(classifyShotFeasibility(100_000, 5)).toBe("fair");
    expect(classifyShotFeasibility(170_000, 9)).toBe("poor");
    expect(classifyShotFeasibility(90_000, 2.5)).toBe("poor");
  });
});

