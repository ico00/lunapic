import { describe, expect, it } from "vitest";
import {
  formatOpenSkyAircraftIndexLabel,
  openSkyAircraftIndexShardPrefix,
} from "@/lib/flight/openskyAircraftIndexShard";

describe("openSkyAircraftIndexShardPrefix", () => {
  it("returns three hex chars lowercase", () => {
    expect(openSkyAircraftIndexShardPrefix("3C6444")).toBe("3c6");
    expect(openSkyAircraftIndexShardPrefix("aa3487")).toBe("aa3");
  });
  it("returns null for invalid id", () => {
    expect(openSkyAircraftIndexShardPrefix("")).toBeNull();
    expect(openSkyAircraftIndexShardPrefix("xyz123")).toBeNull();
    expect(openSkyAircraftIndexShardPrefix("3c644")).toBeNull();
  });
});

describe("formatOpenSkyAircraftIndexLabel", () => {
  it("uses manufacturer + model when both set", () => {
    expect(
      formatOpenSkyAircraftIndexLabel([
        "BE36",
        "A36",
        "Raytheon Aircraft Company",
      ])
    ).toBe("Raytheon Aircraft Company A36");
  });
  it("does not duplicate manufacturer if model already starts with it", () => {
    expect(
      formatOpenSkyAircraftIndexLabel([
        "B738",
        "Boeing 737-8AS (W)",
        "Boeing",
      ])
    ).toBe("Boeing 737-8AS (W)");
  });
  it("falls back to model, manufacturer, or typecode", () => {
    expect(formatOpenSkyAircraftIndexLabel(["B738", "737-800", ""])).toBe(
      "737-800"
    );
    expect(formatOpenSkyAircraftIndexLabel(["B738", "", ""])).toBe("B738");
    expect(formatOpenSkyAircraftIndexLabel(["", "", "Airbus"])).toBe("Airbus");
  });
});
