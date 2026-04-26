import { describe, expect, it } from "vitest";
import {
  AstroService,
  MOON_PATH_SAMPLE_COUNT,
  MOON_PATH_STEP_MS,
} from "./astroService";

describe("AstroService.getMoonPathSamples", () => {
  it("returns fixed count and 30 min steps", () => {
    const t0 = Date.UTC(2020, 5, 10, 12, 0, 0);
    const path = AstroService.getMoonPathSamples(t0, 45.8, 15.98);
    expect(path).toHaveLength(MOON_PATH_SAMPLE_COUNT);
    expect(path[0]!.epochMs).toBe(t0);
    expect(path[1]!.epochMs - path[0]!.epochMs).toBe(MOON_PATH_STEP_MS);
  });

  it("agrees with getMoonState for first sample", () => {
    const t0 = Date.UTC(2018, 0, 1, 0, 0, 0);
    const s = AstroService.getMoonPathSamples(t0, 0, 0);
    const m = AstroService.getMoonState(new Date(t0), 0, 0);
    expect(s[0]!.azimuthDeg).toBeCloseTo(m.azimuthDeg, 5);
    expect(s[0]!.altitudeDeg).toBeCloseTo(m.altitudeDeg, 5);
  });
});
