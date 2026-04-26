import { describe, expect, it } from "vitest";
import type { GroundObserver } from "@/types";
import {
  angularSizeDegFromObjectLengthMeters,
  horizontalAzimuthRateRadPerSec,
  lineOfSightKinematics,
  moonAngularDiameterDeg,
  signedAzimuthGapDeg,
  timeToAzimuthAlignmentSeconds,
  transitDurationCenterToCenterMs,
} from "./lineOfSightKinematics";

const zagreb: GroundObserver = {
  lat: 45.815,
  lng: 15.9819,
  groundHeightMeters: 0,
};

describe("lineOfSightKinematics", () => {
  it("horizontalAzimuthRateRadPerSec: off-axis track produces non-zero ω", () => {
    const e = 0;
    const n = 1000;
    const ω = horizontalAzimuthRateRadPerSec(e, n, 100, 90);
    expect(ω).toBeCloseTo(0.1, 5);
  });

  it("horizontalAzimuthRateRadPerSec: near-overhead returns 0", () => {
    expect(horizontalAzimuthRateRadPerSec(0.1, 0.1, 100, 90)).toBe(0);
  });

  it("lineOfSightKinematics: slant ≥ horizontal", () => {
    const k = lineOfSightKinematics(
      zagreb,
      zagreb.lat + 0.05,
      zagreb.lng,
      10_000,
      200,
      90
    );
    expect(k.slantRangeMeters).toBeGreaterThanOrEqual(k.horizontalRangeMeters);
    expect(k.horizontalRangeMeters).toBeGreaterThan(0);
  });

  it("signedAzimuthGapDeg wraps to [-180, 180]", () => {
    expect(signedAzimuthGapDeg(20, 10)).toBeCloseTo(10);
    expect(signedAzimuthGapDeg(10, 350)).toBeCloseTo(20);
  });

  it("transitDurationCenterToCenterMs", () => {
    expect(transitDurationCenterToCenterMs(0, 1, 1)).toBeNull();
    expect(transitDurationCenterToCenterMs(0.1, 0.5, 0.02)).toBeCloseTo(5200);
  });

  it("moonAngularDiameterDeg", () => {
    expect(moonAngularDiameterDeg(0.25)).toBeCloseTo(0.5);
  });

  it("angularSizeDegFromObjectLengthMeters", () => {
    expect(angularSizeDegFromObjectLengthMeters(40, 0.5)).toBe(0);
    const θ = angularSizeDegFromObjectLengthMeters(40, 20_000);
    expect(θ).toBeGreaterThan(0);
    expect(θ).toBeLessThan(1);
  });

  it("timeToAzimuthAlignmentSeconds", () => {
    expect(timeToAzimuthAlignmentSeconds(10, 0.05, 0.05)).toBeNull();
    expect(timeToAzimuthAlignmentSeconds(-100, 1, 0)).toBeCloseTo(100);
    expect(timeToAzimuthAlignmentSeconds(10, 0, 0)).toBeNull();
  });
});
