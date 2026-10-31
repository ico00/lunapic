import { describe, expect, it } from "vitest";
import {
  forecastNowMs,
  forecastObserver,
  instantWithHighMoon,
  sessionsCrossingMoon,
} from "./forecastFixtures";
import { forecastPhotoSpots } from "./photoSpotForecast";

const DAY_MS = 86_400_000;
const args = {
  observer: forecastObserver,
  nowMs: forecastNowMs,
  toMs: forecastNowMs + 14 * DAY_MS,
  maxSpotM: 2000,
  minCoveragePercent: 5,
  maxSpreadM: 2500,
};

describe("forecastPhotoSpots", () => {
  const closestAtMs = instantWithHighMoon(5);
  const sessions = new Map([["ABC123", sessionsCrossingMoon(closestAtMs, 45)]]);

  it("finds a spot days ahead, close to where the track crosses the Moon", async () => {
    const { spots } = await forecastPhotoSpots(sessions, args);
    const spot = spots.find((s) => Math.abs(s.atMs - closestAtMs) < 300_000);
    expect(spot).toBeDefined();
    expect(spot!.distanceFromObserverM).toBeLessThanOrEqual(2000);
    expect(spot!.path.length).toBeGreaterThan(5);
  });

  it("keeps the largest passes across the whole window when there are too many", async () => {
    const many = new Map(
      Array.from({ length: 120 }, (_, i) => [
        `CS${i}`,
        sessionsCrossingMoon(closestAtMs + i * 60_000, 45),
      ])
    );
    const { spots, matchedSpotCount } = await forecastPhotoSpots(many, args);
    expect(matchedSpotCount).toBeGreaterThan(100);
    expect(spots).toHaveLength(100);
    expect(spots.map((s) => s.atMs)).toEqual(spots.map((s) => s.atMs).sort((a, b) => a - b));
  });

  it("explains an empty result with near-misses and the coverage ceiling", async () => {
    const { spots, closest, bestCoveragePercent } = await forecastPhotoSpots(sessions, {
      ...args,
      minCoveragePercent: 200,
    });
    expect(spots).toEqual([]);
    expect(closest.length).toBeGreaterThan(0);
    expect(bestCoveragePercent).toBeGreaterThan(0);
  });

  it("still explains passes the flat-Earth screen ruled out", async () => {
    const { spots, closest } = await forecastPhotoSpots(sessions, {
      ...args,
      toMs: forecastNowMs + 4.5 * DAY_MS,
      maxSpotM: 500,
    });
    expect(spots).toEqual([]);
    expect(closest.length).toBeGreaterThan(0);
  });
});
