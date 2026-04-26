import {
  isMoonVisibleByRiseSet,
} from "./moonVisibility";
import { describe, expect, it } from "vitest";

describe("isMoonVisibleByRiseSet", () => {
  it("is true when always up", () => {
    expect(
      isMoonVisibleByRiseSet(new Date(0), {
        rise: null,
        set: null,
        kind: "alwaysUp",
      })
    ).toBe(true);
  });
  it("is false when always down", () => {
    expect(
      isMoonVisibleByRiseSet(new Date(0), {
        rise: null,
        set: null,
        kind: "alwaysDown",
      })
    ).toBe(false);
  });
  it("is true when at is between rise and set (same day)", () => {
    const rise = new Date("2020-01-15T20:00:00.000Z");
    const set = new Date("2020-01-16T04:00:00.000Z");
    const mid = new Date("2020-01-16T00:00:00.000Z");
    expect(
      isMoonVisibleByRiseSet(mid, { rise, set, kind: "normal" })
    ).toBe(true);
  });
  it("handles overnight set before rise in wall-clock (set earlier than rise)", () => {
    const rise = new Date("2020-01-16T20:00:00.000Z");
    const set = new Date("2020-01-16T04:00:00.000Z");
    const beforeSet = new Date("2020-01-16T02:00:00.000Z");
    const afterRise = new Date("2020-01-16T21:00:00.000Z");
    expect(
      isMoonVisibleByRiseSet(beforeSet, { rise, set, kind: "normal" })
    ).toBe(true);
    expect(
      isMoonVisibleByRiseSet(afterRise, { rise, set, kind: "normal" })
    ).toBe(true);
    const day = new Date("2020-01-16T12:00:00.000Z");
    expect(
      isMoonVisibleByRiseSet(day, { rise, set, kind: "normal" })
    ).toBe(false);
  });
});
