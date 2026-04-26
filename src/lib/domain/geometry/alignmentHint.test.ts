import { describe, expect, it } from "vitest";
import {
  nudgeNorthSouthMeters,
  signedAzimuthDiffFromMoonToAcDeg,
  timeDeltaMinutesLabel,
} from "./alignmentHint";

describe("alignmentHint", () => {
  it("signedAzimuthDiffFromMoonToAcDeg", () => {
    expect(signedAzimuthDiffFromMoonToAcDeg(0, 10)).toBeCloseTo(10);
    expect(signedAzimuthDiffFromMoonToAcDeg(350, 10)).toBeCloseTo(20);
  });

  it("nudgeNorthSouthMeters: within dead zone → 0", () => {
    const r = nudgeNorthSouthMeters(0.01, 45);
    expect(r.meters).toBe(0);
  });

  it("nudgeNorthSouthMeters: direction sign", () => {
    const north = nudgeNorthSouthMeters(-5, 45);
    const south = nudgeNorthSouthMeters(5, 45);
    expect(north.cardinal).toBe("north");
    expect(south.cardinal).toBe("south");
    expect(north.meters).toBeGreaterThan(0);
  });

  it("timeDeltaMinutesLabel", () => {
    expect(timeDeltaMinutesLabel(0)).toBe("0 min");
    expect(timeDeltaMinutesLabel(120_000)).toBe("+2 min");
    expect(timeDeltaMinutesLabel(-90_000)).toBe("−1 min");
    expect(timeDeltaMinutesLabel(-120_000)).toBe("−2 min");
  });
});
