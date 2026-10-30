import { describe, expect, it } from "vitest";
import {
  extrapolateFlightForDisplay,
  predictedVerticalRateMps,
} from "./extrapolateFlightPosition";
import type { FlightState } from "@/types/flight";

const flight: FlightState = {
  id: "abc",
  position: { lat: 45.8, lng: 16 },
  baroAltitudeMeters: 3_000,
  geoAltitudeMeters: 3_100,
  groundSpeedMps: 200,
  trackDeg: 90,
  timestamp: 0,
  verticalRateFpm: 2_000,
};

describe("predictedVerticalRateMps", () => {
  it.each([null, undefined, NaN, 0, 299, -299])("drži visinu za %s ft/min", (fpm) => {
    expect(predictedVerticalRateMps({ verticalRateFpm: fpm })).toBe(0);
  });

  it("pretvara stvarno penjanje i spuštanje u m/s", () => {
    expect(predictedVerticalRateMps({ verticalRateFpm: 1000 })).toBeCloseTo(5.08);
    expect(predictedVerticalRateMps({ verticalRateFpm: -1000 })).toBeCloseTo(-5.08);
  });
});

describe("extrapolateFlightForDisplay", () => {
  it("pomiče visinu za starost fixa", () => {
    const f = extrapolateFlightForDisplay(flight, 10_000, 0);
    expect(f.geoAltitudeMeters).toBeCloseTo(3_100 + 101.6);
    expect(f.baroAltitudeMeters).toBeCloseTo(3_000 + 101.6);
  });

  it("kapa visinu istim leadom kao poziciju", () => {
    const f = extrapolateFlightForDisplay(flight, 600_000, 0);
    expect(f.geoAltitudeMeters).toBeCloseTo(3_100 + 40 * 10.16);
  });

  it("ne izmišlja visinu koje nema", () => {
    const f = extrapolateFlightForDisplay({ ...flight, baroAltitudeMeters: null }, 10_000, 0);
    expect(f.baroAltitudeMeters).toBeNull();
  });
});
