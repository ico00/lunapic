import { describe, expect, it } from "vitest";
import { forecastNowMs, forecastObserver, instantWithHighMoon, sessionsCrossingMoon } from "./forecastFixtures";
import { buildSkyDensity, mergeWatchWindows, watchSlots } from "./watchWindows";

const DAY_MS = 86_400_000;
const args = { observer: forecastObserver, nowMs: forecastNowMs, toMs: forecastNowMs + 14 * DAY_MS };
const moon = { altitudeDeg: 40, azimuthDeg: 180, apparentRadius: { degrees: 0.26 } };

function slot(startMs: number, rating: "best" | "good" | null, expectedTransits = 0.1) {
  return { startMs, rating, expectedTransits, moon } as Parameters<typeof mergeWatchWindows>[0][number];
}

describe("watch windows", () => {
  it("rates the time the Moon sits on a busy line, not the empty sky", async () => {
    const crossingAtMs = instantWithHighMoon(5);
    const sessions = new Map([
      ["ABC123", [...sessionsCrossingMoon(crossingAtMs, 0), ...sessionsCrossingMoon(crossingAtMs, 45)]],
    ]);
    const density = await buildSkyDensity(sessions, forecastObserver);
    const slots = watchSlots(density, args);
    const windows = mergeWatchWindows(slots);

    expect(slots.length).toBeGreaterThan(100);
    expect(windows.some((w) => crossingAtMs >= w.startMs - 1800_000 && crossingAtMs < w.endMs + 1800_000)).toBe(true);
    expect(slots.filter((s) => s.rating !== null).every((s) => s.expectedTransits > 0)).toBe(true);
  });

  it("never rates a slot with no traffic, and skips a low Moon", () => {
    const slots = watchSlots(new Map(), args);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.rating === null)).toBe(true);
    expect(slots.every((s) => s.moon.altitudeDeg >= 12)).toBe(true);
    expect(mergeWatchWindows(slots)).toEqual([]);
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

  it("does not bridge a gap where the Moon was too low", () => {
    const half = 30 * 60_000;
    expect(mergeWatchWindows([slot(0, "good"), slot(5 * half, "good")])).toHaveLength(2);
  });
});
