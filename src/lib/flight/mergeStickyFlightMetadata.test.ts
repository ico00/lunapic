import { mergeStickyFlightMetadata } from "@/lib/flight/mergeStickyFlightMetadata";
import type { FlightState } from "@/types/flight";
import { describe, expect, it } from "vitest";

const base = (
  id: string,
  overrides: Partial<FlightState> = {}
): FlightState => ({
  id,
  icao24: id,
  position: { lat: 46, lng: 16 },
  baroAltitudeMeters: 10_000,
  geoAltitudeMeters: 10_000,
  groundSpeedMps: 200,
  trackDeg: 90,
  timestamp: Date.now(),
  ...overrides,
});

describe("mergeStickyFlightMetadata", () => {
  it("fills missing category from previous refresh", () => {
    const prev = [
      base("abc", {
        callSign: "TST123",
        adsbEmitterCategory: 4,
        aircraftType: null,
      }),
    ];
    const next = [
      base("abc", {
        callSign: "TST123",
        adsbEmitterCategory: null,
        aircraftType: null,
      }),
    ];
    const m = mergeStickyFlightMetadata(next, prev);
    expect(m[0].adsbEmitterCategory).toBe(4);
  });

  it("prefers new category when present", () => {
    const prev = [base("abc", { adsbEmitterCategory: 2 })];
    const next = [base("abc", { adsbEmitterCategory: 5 })];
    const m = mergeStickyFlightMetadata(next, prev);
    expect(m[0].adsbEmitterCategory).toBe(5);
  });

  it("keeps zero category from new data", () => {
    const prev = [base("abc", { adsbEmitterCategory: 4 })];
    const next = [base("abc", { adsbEmitterCategory: 0 })];
    const m = mergeStickyFlightMetadata(next, prev);
    expect(m[0].adsbEmitterCategory).toBe(0);
  });

  it("fills aircraftType when missing", () => {
    const prev = [base("x", { aircraftType: "A320" })];
    const next = [base("x", { aircraftType: null })];
    const m = mergeStickyFlightMetadata(next, prev);
    expect(m[0].aircraftType).toBe("A320");
  });

  it("no previous — passthrough", () => {
    const next = [base("x", { adsbEmitterCategory: null })];
    expect(mergeStickyFlightMetadata(next, undefined)).toBe(next);
  });
});
