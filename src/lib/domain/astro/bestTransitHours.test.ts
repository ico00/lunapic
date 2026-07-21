import { describe, expect, it } from "vitest";
import {
  bestHourOfDay,
  computeBestTransitHours,
  GREAT_MIN_COVERAGE_PERCENT,
} from "./bestTransitHours";

const ZAGREB = { lat: 45.83, lng: 16.064, groundHeightMeters: 120 };

function localDayStartMs(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

describe("computeBestTransitHours", () => {
  it("vraća 24 uzorka s konzistentnim tierovima", () => {
    const samples = computeBestTransitHours(ZAGREB, localDayStartMs(2026, 8, 6));
    expect(samples).toHaveLength(24);
    for (const s of samples) {
      if (s.tier === "belowHorizon") {
        expect(s.coveragePercent).toBeNull();
        expect(s.slantMeters).toBeNull();
      } else {
        expect(s.coveragePercent).toBeGreaterThan(0);
        expect(s.slantMeters).toBeGreaterThan(10_000);
      }
    }
  });

  it("6.08.2026 (zadnja četvrt, Zagreb): jutro oko 05h je 'great'", () => {
    // Mjesec je tada na ~58° → slant ~13 km → ~17 % diska.
    const samples = computeBestTransitHours(ZAGREB, localDayStartMs(2026, 8, 6));
    const five = samples[5];
    expect(five.tier).toBe("great");
    expect(five.moonAltitudeDeg).toBeGreaterThan(45);
    expect(five.coveragePercent ?? 0).toBeGreaterThanOrEqual(
      GREAT_MIN_COVERAGE_PERCENT
    );
    expect(bestHourOfDay(samples)?.tier).toBe("great");
  });

  it("18.07.2026 (mladi srp, Zagreb): tamni sati večeri nemaju 'great'", () => {
    // Nakon zalaska sunca srp brzo pada: 21:30 → 12.4° (rub "ok"),
    // 22:30 → 2.4° (ispod praga), 23:30 → ispod horizonta.
    const samples = computeBestTransitHours(ZAGREB, localDayStartMs(2026, 7, 18));
    expect(samples[21].tier).not.toBe("great");
    expect(samples[22].tier).toBe("belowHorizon");
    expect(samples[23].tier).toBe("belowHorizon");
  });

  it("veća elevacija ⇒ manji slant ⇒ veća silueta (monotonija)", () => {
    const samples = computeBestTransitHours(ZAGREB, localDayStartMs(2026, 8, 6));
    const visible = samples.filter((s) => s.coveragePercent != null);
    const byAlt = [...visible].sort((a, b) => a.moonAltitudeDeg - b.moonAltitudeDeg);
    for (let i = 1; i < byAlt.length; i += 1) {
      expect(byAlt[i].coveragePercent!).toBeGreaterThanOrEqual(
        byAlt[i - 1].coveragePercent! - 1e-9
      );
    }
  });
});
