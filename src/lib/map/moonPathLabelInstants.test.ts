import { describe, expect, it } from "vitest";
import { getMoonPathLabelInstants } from "./moonPathLabelInstants";

const H = 3_600_000;

describe("getMoonPathLabelInstants", () => {
  it("alway includes exact rise (t0) and set (t1) when 2h grid misses set", () => {
    const t0 = 12 * H + 30 * 60_000; // 12:30
    const t1 = 27 * H + 45 * 60_000; // +15h 15m
    const step = 2 * H;
    const a = getMoonPathLabelInstants(t0, t1, step);
    expect(a[0]).toBe(t0);
    expect(a[a.length - 1]).toBe(t1);
  });

  it("keeps t0 and t1 when t0 is the only mark", () => {
    const t0 = 5 * H;
    const t1 = t0;
    expect(getMoonPathLabelInstants(t0, t1, 2 * H)).toEqual([t0]);
  });
});
