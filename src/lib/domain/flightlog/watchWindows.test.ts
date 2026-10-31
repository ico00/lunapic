import { describe, expect, it } from "vitest";
import { getSunAltitudeDeg } from "@/lib/domain/astro/moon";
import {
  forecastNowMs,
  forecastObserver,
  instantWithVisibleMoon,
  sessionsCrossingMoon,
} from "./forecastFixtures";
import { buildSkyDensity, mergeWatchWindows, summarizeWatchSlots, watchSlots } from "./watchWindows";

const DAY_MS = 86_400_000;
const args = { observer: forecastObserver, nowMs: forecastNowMs, toMs: forecastNowMs + 14 * DAY_MS };
const moon = { altitudeDeg: 40, azimuthDeg: 180, apparentRadius: { degrees: 0.26 } };
const { lat, lng, groundHeightMeters } = forecastObserver;

function slot(startMs: number, rating: "best" | "good" | null, expectedTransits = 0.1) {
  return { startMs, rating, expectedTransits, moon } as Parameters<typeof mergeWatchWindows>[0][number];
}

/** Ista ruta dovoljno puta da gustoća prijeđe pragove. */
async function busyLineDensity(crossingAtMs: number) {
  const sessions = sessionsCrossingMoon(crossingAtMs, 0);
  return buildSkyDensity(
    new Map([["ABC123", Array.from({ length: 40 }, () => sessions).flat()]]),
    forecastObserver
  );
}

describe("watch windows", () => {
  it("rates the time the Moon sits on a busy line, not the empty sky", async () => {
    const crossingAtMs = instantWithVisibleMoon();
    const slots = watchSlots(await busyLineDensity(crossingAtMs), args);
    const windows = mergeWatchWindows(slots);

    expect(windows.some((w) => crossingAtMs >= w.startMs - 1800_000 && crossingAtMs < w.endMs + 1800_000)).toBe(true);
    expect(slots.some((s) => s.rating === null)).toBe(true);
  });

  it("offers only a Moon that can be shot", () => {
    const slots = watchSlots(new Map(), args);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.moon.altitudeDeg).toBeGreaterThanOrEqual(12);
      expect(s.moon.illuminationFraction).toBeGreaterThanOrEqual(0.2);
      expect(getSunAltitudeDeg(new Date(s.startMs + 900_000), lat, lng, groundHeightMeters)).toBeLessThanOrEqual(-6);
    }
  });

  it("does not call a quiet period good just because it is the best of it", () => {
    const slots = watchSlots(new Map(), args);
    expect(slots.every((s) => s.rating === null)).toBe(true);
    expect(mergeWatchWindows(slots)).toEqual([]);
  });

  it("sums the whole period for an honest headline", () => {
    expect(summarizeWatchSlots([slot(0, null, 0.04), slot(1800_000, "good", 0.06)])).toEqual({
      usableHours: 1,
      expectedTransits: 0.1,
    });
  });

  it("merges neighbouring slots and sums what to expect", () => {
    const half = 30 * 60_000;
    const [first, second] = mergeWatchWindows([
      slot(0, "good", 0.1),
      slot(half, "best", 0.2),
      slot(2 * half, null),
      slot(3 * half, "good", 0.05),
    ]);
    expect(first).toMatchObject({ startMs: 0, endMs: 2 * half, rating: "best", expectedTransits: 0.3 });
    expect(second).toMatchObject({ startMs: 3 * half, endMs: 4 * half, rating: "good" });
  });

  it("does not bridge a gap where the Moon was unusable", () => {
    const half = 30 * 60_000;
    expect(mergeWatchWindows([slot(0, "good"), slot(5 * half, "good")])).toHaveLength(2);
  });
});
