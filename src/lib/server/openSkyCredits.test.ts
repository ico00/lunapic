import { describe, expect, it } from "vitest";

import {
  createOpenSkyCreditsTracker,
  OPENSKY_LOW_CREDITS_WARN_BELOW,
  parseRateLimitRemaining,
} from "./openSkyCredits";

describe("parseRateLimitRemaining", () => {
  it("čita cijeli broj, uključujući nulu", () => {
    expect(parseRateLimitRemaining("3987")).toBe(3987);
    expect(parseRateLimitRemaining(" 42 ")).toBe(42);
    expect(parseRateLimitRemaining("0")).toBe(0);
  });

  it("odbija ono što nije nenegativan cijeli broj", () => {
    expect(parseRateLimitRemaining(null)).toBeNull();
    expect(parseRateLimitRemaining("")).toBeNull();
    expect(parseRateLimitRemaining("abc")).toBeNull();
    expect(parseRateLimitRemaining("12.5")).toBeNull();
    expect(parseRateLimitRemaining("-1")).toBeNull();
  });
});

describe("createOpenSkyCreditsTracker", () => {
  it("bez očitanja nema zadnjeg stanja niti upozorenja", () => {
    const t = createOpenSkyCreditsTracker();
    expect(t.lastKnown()).toBeNull();
    expect(t.isLow()).toBe(false);
  });

  it("pamti zadnje valjano očitanje", () => {
    const t = createOpenSkyCreditsTracker();
    t.record("3990");
    t.record("3980");
    expect(t.lastKnown()).toBe(3980);
  });

  it("neispravno očitanje ne briše zadnje poznato", () => {
    const t = createOpenSkyCreditsTracker();
    t.record("3980");
    expect(t.record("nope")).toBeNull();
    expect(t.lastKnown()).toBe(3980);
  });

  it("prag upozorenja gleda zadnje očitanje", () => {
    const t = createOpenSkyCreditsTracker();
    t.record(String(OPENSKY_LOW_CREDITS_WARN_BELOW));
    expect(t.isLow()).toBe(false);
    t.record(String(OPENSKY_LOW_CREDITS_WARN_BELOW - 1));
    expect(t.isLow()).toBe(true);
  });
});
