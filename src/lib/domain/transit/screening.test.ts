import { describe, expect, it } from "vitest";
import type { MoonState } from "@/types";
import type { FlightState } from "@/types/flight";
import { horizontalToPoint } from "../geometry/horizontal";
import { screenTransitCandidates } from "./screening";

function flight(
  id: string,
  lat: number,
  lng: number,
  hM: number
): FlightState {
  return {
    id,
    position: { lat, lng },
    baroAltitudeMeters: hM,
    geoAltitudeMeters: hM,
    groundSpeedMps: 200,
    trackDeg: 90,
    timestamp: 0,
  };
}

describe("screenTransitCandidates", () => {
  const observer = { lat: 45.8, lng: 15.95, groundHeightMeters: 0 };

  it("empty list → []", () => {
    const moon: MoonState = {
      altitudeDeg: 40,
      azimuthDeg: 100,
      distanceKm: 380_000,
      apparentRadius: { degrees: 0.25 },
      phaseFraction: 0.3,
      illuminationFraction: 0.5,
    };
    expect(screenTransitCandidates(observer, moon, [])).toEqual([]);
  });

  it("skips flights without any altitude", () => {
    const moon: MoonState = {
      altitudeDeg: 40,
      azimuthDeg: 100,
      distanceKm: 380_000,
      apparentRadius: { degrees: 0.25 },
      phaseFraction: 0.3,
      illuminationFraction: 0.5,
    };
    const f: FlightState = {
      id: "x",
      position: { lat: 46, lng: 16 },
      baroAltitudeMeters: null,
      geoAltitudeMeters: null,
      groundSpeedMps: null,
      trackDeg: null,
      timestamp: 0,
    };
    expect(screenTransitCandidates(observer, moon, [f])).toEqual([]);
  });

  it("aligns sky direction with moon → low separation, possible transit", () => {
    const h = 10_000;
    const fLat = 45.9;
    const fLng = 15.95;
    const ac = horizontalToPoint(observer, fLat, fLng, h);
    const moon: MoonState = {
      altitudeDeg: ac.altitudeDeg,
      azimuthDeg: ac.azimuthDeg,
      distanceKm: 380_000,
      apparentRadius: { degrees: 0.3 },
      phaseFraction: 0.5,
      illuminationFraction: 1,
    };
    const out = screenTransitCandidates(observer, moon, [flight("a", fLat, fLng, h)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.separationDeg).toBeLessThan(0.1);
    expect(out[0]!.isPossibleTransit).toBe(true);
  });

  it("sorts by angular separation (closer first)", () => {
    const h = 10_000;
    const f1Lat = 45.85;
    const f1Lng = 16.2;
    const f2Lat = 45.85;
    const f2Lng = 16.25;
    const m: MoonState = {
      altitudeDeg: 50,
      azimuthDeg: 100,
      distanceKm: 380_000,
      apparentRadius: { degrees: 0.2 },
      phaseFraction: 0.2,
      illuminationFraction: 0.4,
    };
    const out = screenTransitCandidates(observer, m, [
      flight("far", f2Lat, f2Lng, h),
      flight("near", f1Lat, f1Lng, h),
    ]);
    expect(out.length).toBe(2);
    expect(out[0]!.separationDeg).toBeLessThanOrEqual(out[1]!.separationDeg);
  });
});
