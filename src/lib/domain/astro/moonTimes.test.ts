import { describe, expect, it } from "vitest";
import { getMoonPosition } from "@/lib/domain/astro/moon";
import { getMoonRiseSetForLocalDay } from "@/lib/domain/astro/moonTimes";

const LAT = 45.8297;
const LNG = 16.0637;

describe("getMoonRiseSetForLocalDay", () => {
  it("returns events inside the local calendar day only", () => {
    for (let i = 0; i < 40; i++) {
      const start = new Date(2026, 9, 1 + i);
      const end = new Date(2026, 9, 2 + i);
      const { rise, set, kind } = getMoonRiseSetForLocalDay(
        new Date(2026, 9, 1 + i, 12),
        LAT,
        LNG
      );
      expect(kind).toBe("normal");
      for (const event of [rise, set]) {
        if (event == null) continue;
        expect(event.getTime()).toBeGreaterThanOrEqual(start.getTime());
        expect(event.getTime()).toBeLessThan(end.getTime());
      }
    }
  });

  it("agrees with the altitude the rest of the app shows", () => {
    // Rub diska je na horizontu: središte je oko polumjera ispod nule, a ne
    // 1° iznad kao kod geocentričnog izlaza (SunCalc).
    const { rise, set } = getMoonRiseSetForLocalDay(new Date(2026, 9, 28, 12), LAT, LNG);
    for (const event of [rise, set]) {
      expect(event).not.toBeNull();
      const altitude = getMoonPosition(event as Date, LAT, LNG).altitudeDeg;
      expect(Math.abs(altitude)).toBeLessThan(0.5);
    }
  });

  it("gives the same answer for any instant of the same local day", () => {
    const morning = getMoonRiseSetForLocalDay(new Date(2026, 9, 28, 0, 5), LAT, LNG);
    const evening = getMoonRiseSetForLocalDay(new Date(2026, 9, 28, 23, 55), LAT, LNG);
    expect(evening.rise?.getTime()).toBe(morning.rise?.getTime());
    expect(evening.set?.getTime()).toBe(morning.set?.getTime());
  });
});
