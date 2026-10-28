import { describe, expect, it } from "vitest";
import { CAUTION_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { moonAltitudeAtAirportDeg } from "./runwayShadowPlan";
import {
  SUGGESTED_WINDOW_MINUTES,
  computeBestPlanningDays,
  planningDateKey,
  suggestedPlanRange,
} from "./runwayPlanDays";

/** 28.10.2026 07:20 CET = 06:20 UTC; Mjesec 19° (ručni KML). Isti UTC trenutak u CI (UTC) i lokalno (CET). */
const MORNING_2026_10_28 = Date.UTC(2026, 9, 28, 6, 20, 0);

describe("computeBestPlanningDays", () => {
  const [day] = computeBestPlanningDays(Date.UTC(2026, 9, 28, 12, 0, 0), 1);

  it("keys the day like the panel does", () => {
    expect(day!.dateKey).toBe(planningDateKey(new Date(day!.dayStartMs)));
  });

  it("has a window that contains the KML morning (Moon 19° at 07:20 CET)", () => {
    expect(
      day!.windows.some((w) => w.startMs <= MORNING_2026_10_28 && MORNING_2026_10_28 <= w.endMs)
    ).toBe(true);
  });

  it("only spans instants where the Moon is at or above the optimal tier", () => {
    for (const w of day!.windows) {
      expect(w.startAltitudeDeg).toBeGreaterThanOrEqual(CAUTION_BELOW_DEG);
      expect(w.endAltitudeDeg).toBeGreaterThanOrEqual(CAUTION_BELOW_DEG);
      expect(moonAltitudeAtAirportDeg(w.startMs)).toBeGreaterThanOrEqual(CAUTION_BELOW_DEG);
      expect(w.endMs - w.startMs).toBeGreaterThanOrEqual(30 * 60_000);
    }
  });

  it("reports a nearly full Moon two days after the 26.10.2026 full Moon", () => {
    expect(day!.illuminationFraction).toBeGreaterThan(0.85);
  });

  it("returns the requested number of consecutive days", () => {
    const days = computeBestPlanningDays(Date.UTC(2026, 9, 28, 12, 0, 0), 30);
    expect(days).toHaveLength(30);
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i]!.dayStartMs).toBeGreaterThan(days[i - 1]!.dayStartMs);
    }
  });
});

describe("suggestedPlanRange", () => {
  it("caps a long window at the suggested length", () => {
    const w = { startMs: 0, endMs: 6 * 3_600_000, startAltitudeDeg: 20, endAltitudeDeg: 30 };
    expect(suggestedPlanRange(w)).toEqual({ startMs: 0, endMs: SUGGESTED_WINDOW_MINUTES * 60_000 });
  });

  it("keeps a short window as is", () => {
    const w = { startMs: 0, endMs: 40 * 60_000, startAltitudeDeg: 20, endAltitudeDeg: 14 };
    expect(suggestedPlanRange(w)).toEqual({ startMs: 0, endMs: 40 * 60_000 });
  });
});
