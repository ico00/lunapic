import { describe, expect, it } from "vitest";
import { placeStationLabels } from "./MoonTimeLine";

// Traka od 480 px; "Now" na početku zauzima ~[-3, 18] px.
const TRACK = 480;
const NOW_AT_START = [-3, 18] as const;

describe("placeStationLabels", () => {
  it("lifts a station label above the line when it would cover Now", () => {
    const rows = placeStationLabels(
      [
        { frac: 0.02, label: "Above 5° 19:47" },
        { frac: 0.45, label: "Peak 03:17", detail: " · 41°" },
        { frac: 0.85, label: "Below 5° 11:17" },
      ],
      TRACK,
      NOW_AT_START,
    );
    expect(rows).toEqual(["above", "below", "below"]);
  });

  it("lifts the later of two stations that would collide below the line", () => {
    const rows = placeStationLabels(
      [
        { frac: 0.5, label: "Peak 03:17" },
        { frac: 0.55, label: "Below 5° 04:02" },
      ],
      TRACK,
      NOW_AT_START,
    );
    expect(rows).toEqual(["below", "above"]);
  });

  it("keeps every label below the line when nothing collides", () => {
    const rows = placeStationLabels(
      [
        { frac: 0.3, label: "Peak 03:17" },
        { frac: 0.8, label: "Below 5° 11:17" },
      ],
      TRACK,
      NOW_AT_START,
    );
    expect(rows).toEqual(["below", "below"]);
  });
});
