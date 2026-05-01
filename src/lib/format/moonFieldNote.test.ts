import { describe, expect, it } from "vitest";
import { formatMoonFieldNoteText } from "@/lib/format/moonFieldNote";

describe("formatMoonFieldNoteText", () => {
  it("includes observer, moon numbers, rise/set, and visibility", () => {
    const text = formatMoonFieldNoteText({
      referenceEpochMs: 1_700_000_000_000,
      observerLat: 45.82968,
      observerLng: 16.06368,
      observerGroundHeightMeters: 130,
      moon: {
        altitudeDeg: 9.56,
        azimuthDeg: 132.52,
        apparentRadius: { degrees: 0.248 },
        illuminationFraction: 1,
      },
      moonriseText: "20:21:40",
      moonsetText: "05:14:25",
      visibilitySummary: "Optimal — clear sky window",
    });
    expect(text).toContain("LunaPic — Moon field note");
    expect(text).toContain("Observer (WGS84): 45.82968°, 16.06368°");
    expect(text).toContain("Observer ground elevation (m): 130");
    expect(text).toContain("Moon altitude: 9.56°");
    expect(text).toContain("Moon azimuth (from north): 132.52°");
    expect(text).toContain("Moon angular radius: 0.248°");
    expect(text).toContain("Moon illuminated: 100%");
    expect(text).toContain("Moonrise (UTC day): 20:21:40");
    expect(text).toContain("Moonset (UTC day): 05:14:25");
    expect(text).toContain("Field visibility: Optimal — clear sky window");
    expect(text).toContain("balcony or stand logs");
  });
});
