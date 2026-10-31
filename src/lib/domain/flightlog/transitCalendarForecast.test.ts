import { describe, expect, it } from "vitest";
import {
  forecastNowMs,
  forecastObserver,
  instantWithHighMoon,
  sessionsCrossingMoon,
} from "./forecastFixtures";
import { forecastTransitCalendar } from "./transitCalendarForecast";

const DAY_MS = 86_400_000;
const args = {
  observer: forecastObserver,
  nowMs: forecastNowMs,
  toMs: forecastNowMs + 14 * DAY_MS,
  halfVerticalFovDeg: 1,
  halfHorizontalFovDeg: 1.5,
};

describe("forecastTransitCalendar", () => {
  it("finds a transit days ahead, not only on the next pass", async () => {
    const closestAtMs = instantWithHighMoon(5);
    const sessions = new Map([["ABC123", sessionsCrossingMoon(closestAtMs, 0)]]);
    const { entries } = await forecastTransitCalendar(sessions, args);
    const transit = entries.find((e) => Math.abs(e.estimateMs - closestAtMs) < 120_000);
    expect(transit?.kind).toBe("transit");
  });

  it("finds the Moon away from the closest approach to the observer", async () => {
    const closestAtMs = instantWithHighMoon(5);
    const sessions = new Map([["ABC123", sessionsCrossingMoon(closestAtMs, 45)]]);
    const { entries } = await forecastTransitCalendar(sessions, args);
    const transit = entries.find((e) => e.kind === "transit");
    expect(transit).toBeDefined();
    expect(Math.abs(transit!.estimateMs - (closestAtMs + 45_000))).toBeLessThan(30_000);
    expect(transit!.minSeparationDeg).toBeLessThan(0.26);
  });

  it("ignores a pass outside the requested window", async () => {
    const closestAtMs = instantWithHighMoon(5);
    const sessions = new Map([["ABC123", sessionsCrossingMoon(closestAtMs, 0)]]);
    const { entries } = await forecastTransitCalendar(sessions, {
      ...args,
      toMs: forecastNowMs + 2 * DAY_MS,
    });
    expect(entries.some((e) => e.kind === "transit")).toBe(false);
  });
});
