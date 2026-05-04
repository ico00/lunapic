import { describe, expect, it } from "vitest";
import {
  catalogUtcMsForNasaMoonFrame,
  nasaMoonPhaseFrameJpgUrl,
  nasaMoonPhaseMaxFrameForYear,
} from "./nasaMoonPhaseFrame";

describe("nasaMoonPhaseFrame", () => {
  it("maps Jan 1 00:00 UT to moon.0001 for 2023", () => {
    const ms = Date.UTC(2023, 0, 1, 0, 0, 0, 0);
    expect(nasaMoonPhaseFrameJpgUrl(ms)).toBe(
      "https://svs.gsfc.nasa.gov/vis/a000000/a005000/a005048/frames/730x730_1x1_30p/moon.0001.jpg"
    );
  });

  it("uses 8784 max frames for leap 2024", () => {
    expect(nasaMoonPhaseMaxFrameForYear(2024)).toBe(8784);
    expect(nasaMoonPhaseMaxFrameForYear(2025)).toBe(8760);
  });

  it("maps last hour of 2024 to last frame", () => {
    const ms = Date.UTC(2024, 11, 31, 23, 0, 0, 0);
    expect(nasaMoonPhaseFrameJpgUrl(ms)).toBe(
      "https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005187/frames/730x730_1x1_30p/moon.8784.jpg"
    );
  });

  it("clamps simulated years outside catalog to 2026 while preserving calendar fields", () => {
    const ms = Date.UTC(2031, 4, 4, 19, 0, 0, 0);
    const { catalogYear, utcMs } = catalogUtcMsForNasaMoonFrame(ms);
    expect(catalogYear).toBe(2026);
    expect(new Date(utcMs).toISOString()).toBe("2026-05-04T19:00:00.000Z");
    expect(nasaMoonPhaseFrameJpgUrl(ms)).toMatch(
      /a005500\/a005587\/frames\/730x730_1x1_30p\/moon\.\d{4}\.jpg$/
    );
  });

  it("rolls Feb 29 back when target catalog year is not leap", () => {
    const ms = Date.UTC(2028, 1, 29, 12, 0, 0, 0);
    const { catalogYear, utcMs } = catalogUtcMsForNasaMoonFrame(ms);
    expect(catalogYear).toBe(2026);
    expect(new Date(utcMs).toISOString()).toBe("2026-02-28T12:00:00.000Z");
  });
});
