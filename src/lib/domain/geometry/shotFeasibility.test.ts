import { describe, expect, it } from "vitest";
import {
  aircraftAngularSizeDeg,
  classifyShotFeasibility,
  effectiveFocalLengthMm,
  maxShotRangeMetersForCamera,
  moonCoveragePercent,
  moonDiameterPxAtReferenceSensor,
  moonDiameterPxOnOutputFrame,
  moonFrameFillAtReferenceSensor,
  moonFrameFillForOutputFrame,
} from "./shotFeasibility";

describe("shotFeasibility", () => {
  it("computes effective focal by crop factor", () => {
    expect(effectiveFocalLengthMm(600, "fullFrame")).toBe(600);
    expect(effectiveFocalLengthMm(600, "apsC")).toBe(900);
    expect(effectiveFocalLengthMm(600, "apsC16")).toBe(960);
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
    expect(maxShotRangeMetersForCamera(600, "apsC16")).toBeCloseTo(192_000, 3);
  });

  it("estimates moon diameter on 6000x4000 reference frame", () => {
    expect(moonDiameterPxAtReferenceSensor(600, "fullFrame")).toBeCloseTo(948, 3);
    expect(moonDiameterPxAtReferenceSensor(600, "apsC")).toBeCloseTo(1422, 3);
    expect(moonDiameterPxAtReferenceSensor(600, "apsC16")).toBeCloseTo(1517, 0);
    expect(moonDiameterPxAtReferenceSensor(1200, "fullFrame")).toBeCloseTo(1896, 3);
  });

  it("maps moon diameter from reference width to another output width", () => {
    expect(moonDiameterPxOnOutputFrame(948, 6000)).toBeCloseTo(948, 3);
    expect(moonDiameterPxOnOutputFrame(948, 3000)).toBeCloseTo(474, 3);
  });

  it("computes moon fill on an arbitrary output frame", () => {
    const d = moonDiameterPxOnOutputFrame(948, 4000);
    const fill = moonFrameFillForOutputFrame({
      moonDiameterPxOnFrame: d,
      frameWidthPx: 4000,
      frameHeightPx: 3000,
    });
    expect(fill.widthPercent).toBeCloseTo((d / 4000) * 100, 5);
    expect(fill.areaPercent).toBeGreaterThan(0);
  });

  it("computes moon frame fill percentages", () => {
    const fill = moonFrameFillAtReferenceSensor(948);
    expect(fill.widthPercent).toBeCloseTo(15.8, 1);
    expect(fill.heightPercent).toBeCloseTo(23.7, 1);
    expect(fill.areaPercent).toBeGreaterThan(2.5);
  });

  it("classifies excellent / fair / poor", () => {
    expect(classifyShotFeasibility(70_000, 12)).toBe("excellent");
    expect(classifyShotFeasibility(100_000, 5)).toBe("fair");
    expect(classifyShotFeasibility(170_000, 9)).toBe("poor");
    expect(classifyShotFeasibility(90_000, 2.5)).toBe("poor");
  });
});

