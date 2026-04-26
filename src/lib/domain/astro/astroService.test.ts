import { describe, expect, it } from "vitest";
import {
  AstroService,
  buildMoonPathSamplesInTimeRange,
  MOON_PATH_SAMPLE_COUNT,
  MOON_PATH_STEP_MS,
} from "./astroService";

describe("AstroService.getMoonTimes", () => {
  it("returns a normal kind with rise and/or set in typical conditions", () => {
    const t = new Date(Date.UTC(2020, 5, 10, 0, 0, 0));
    const m = AstroService.getMoonTimes(t, 45.8, 15.98);
    if (m.kind === "normal") {
      expect(m.rise != null || m.set != null).toBe(true);
    } else {
      expect(m.rise).toBeNull();
      expect(m.set).toBeNull();
    }
  });
});

describe("AstroService.getMoonPathMapSpec", () => {
  it("alwaysDown → empty", () => {
    const s = AstroService.getMoonPathMapSpec(
      Date.UTC(2020, 5, 10, 12, 0, 0),
      45.8,
      15.98,
      { rise: null, set: null, kind: "alwaysDown" }
    );
    expect(s.samples).toHaveLength(0);
    expect(s.labelWindowMs).toBeNull();
  });

  it("normal with rise/set → samples within that window, shorter or longer than 12h", () => {
    const day = new Date(Date.UTC(2020, 5, 10, 0, 0, 0));
    const times = AstroService.getMoonTimes(day, 45.8, 15.98);
    if (times.kind !== "normal" || !times.rise || !times.set) {
      return;
    }
    const s = AstroService.getMoonPathMapSpec(
      day.getTime(),
      45.8,
      15.98,
      times
    );
    const t0 = times.rise.getTime();
    const t1 =
      times.set.getTime() + (times.set.getTime() <= t0 ? 24 * 3600 * 1000 : 0);
    const lastT = t1;
    expect(s.samples[0]!.epochMs).toBeGreaterThanOrEqual(t0 - 1);
    expect(s.samples[s.samples.length - 1]!.epochMs).toBeLessThanOrEqual(lastT + 1);
    expect(s.labelWindowMs).not.toBeNull();
    expect(s.labelWindowMs!.t0).toBe(t0);
    expect(s.labelWindowMs!.t1).toBe(t1);
  });
});

describe("buildMoonPathSamplesInTimeRange", () => {
  it("returns ordered steps in range", () => {
    const t0 = Date.UTC(2020, 0, 1, 0, 0, 0);
    const t1 = t0 + 2 * MOON_PATH_STEP_MS;
    const a = buildMoonPathSamplesInTimeRange(
      t0,
      t1,
      MOON_PATH_STEP_MS,
      45.8,
      15.98
    );
    expect(a).toHaveLength(3);
    expect(a[0]!.epochMs).toBe(t0);
    expect(a[1]!.epochMs - a[0]!.epochMs).toBe(MOON_PATH_STEP_MS);
  });
});

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
