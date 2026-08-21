import { describe, expect, it } from "vitest";
import { getMoonState } from "@/lib/domain/astro/moon";
import { horizontalToPoint } from "./horizontal";
import { angularSeparationDeg } from "./sky-separation";
import { destinationByAzimuthMeters } from "./wgs84";
import { maxCoveragePercentForAltitude, solveMoonShadowSpot } from "./moonShadowSpot";

/** Zagreb-ish observer region; the instant is only used via the ephemeris. */
const AT_MS = Date.UTC(2026, 4, 23, 19, 30, 0);
const AIRCRAFT = { lat: 45.9, lng: 15.9, altitudeMeters: 11_000 };

/** Separation between the aircraft and the Moon as actually seen from `spot`. */
function separationFromSpotDeg(
  spot: { lat: number; lng: number },
  atMs = AT_MS,
  groundHeightMeters = 120
): number {
  const observer = { lat: spot.lat, lng: spot.lng, groundHeightMeters };
  const moon = getMoonState(new Date(atMs), spot.lat, spot.lng, groundHeightMeters);
  const ac = horizontalToPoint(
    observer,
    AIRCRAFT.lat,
    AIRCRAFT.lng,
    AIRCRAFT.altitudeMeters
  );
  return angularSeparationDeg(ac, moon);
}

describe("solveMoonShadowSpot", () => {
  it("puts the aircraft on the Moon's centre from the solved spot", () => {
    const spot = solveMoonShadowSpot({
      aircraftLat: AIRCRAFT.lat,
      aircraftLng: AIRCRAFT.lng,
      aircraftAltitudeMeters: AIRCRAFT.altitudeMeters,
      atMs: AT_MS,
      groundHeightMeters: 120,
    });
    expect(spot).not.toBeNull();
    // Two orders of magnitude inside the Moon's radius (~0.25°).
    expect(separationFromSpotDeg(spot!)).toBeLessThan(0.002);
    expect(spot!.residualDeg).toBeLessThan(0.001);
  });

  it("beats the flat-Earth height/tan(alt) shortcut it starts from", () => {
    const groundHeightMeters = 120;
    const moon = getMoonState(new Date(AT_MS), AIRCRAFT.lat, AIRCRAFT.lng, groundHeightMeters);
    const flat = destinationByAzimuthMeters(
      AIRCRAFT.lat,
      AIRCRAFT.lng,
      (moon.azimuthDeg + 180) % 360,
      (AIRCRAFT.altitudeMeters - groundHeightMeters) /
        Math.tan((moon.altitudeDeg * Math.PI) / 180)
    );
    const solved = solveMoonShadowSpot({
      aircraftLat: AIRCRAFT.lat,
      aircraftLng: AIRCRAFT.lng,
      aircraftAltitudeMeters: AIRCRAFT.altitudeMeters,
      atMs: AT_MS,
      groundHeightMeters,
    })!;
    // Curvature + parallax the shortcut ignores are worth a real miss.
    expect(separationFromSpotDeg(flat)).toBeGreaterThan(separationFromSpotDeg(solved) * 10);
  });

  it("reports a cross-track tolerance tighter than the along-track one", () => {
    const spot = solveMoonShadowSpot({
      aircraftLat: AIRCRAFT.lat,
      aircraftLng: AIRCRAFT.lng,
      aircraftAltitudeMeters: AIRCRAFT.altitudeMeters,
      atMs: AT_MS,
      groundHeightMeters: 120,
    })!;
    expect(spot.alongTrackToleranceMeters).toBeGreaterThan(spot.crossTrackToleranceMeters);
    // Stepping off the centerline by the stated cross-track tolerance should
    // leave the aircraft near the Moon's limb, not outside the disk.
    const offset = destinationByAzimuthMeters(
      spot.lat,
      spot.lng,
      (spot.moonAzimuthDeg + 90) % 360,
      spot.crossTrackToleranceMeters
    );
    const sep = separationFromSpotDeg(offset);
    expect(sep).toBeGreaterThan(spot.moonApparentRadiusDeg * 0.7);
    expect(sep).toBeLessThan(spot.moonApparentRadiusDeg * 1.3);
  });

  it("returns null when the aircraft is at or below the assumed ground", () => {
    expect(
      solveMoonShadowSpot({
        aircraftLat: AIRCRAFT.lat,
        aircraftLng: AIRCRAFT.lng,
        aircraftAltitudeMeters: 100,
        atMs: AT_MS,
        groundHeightMeters: 120,
      })
    ).toBeNull();
  });

  it("returns null when the Moon is below the visibility floor", () => {
    // Same geometry 12 h later — the Moon has swung under the horizon.
    expect(
      solveMoonShadowSpot({
        aircraftLat: AIRCRAFT.lat,
        aircraftLng: AIRCRAFT.lng,
        aircraftAltitudeMeters: AIRCRAFT.altitudeMeters,
        atMs: AT_MS + 12 * 3_600_000,
        groundHeightMeters: 120,
      })
    ).toBeNull();
  });
});

describe("maxCoveragePercentForAltitude", () => {
  it("caps a 40 m airliner at cruise well under half a Moon diameter", () => {
    // 11 km, Moon overhead — the best case that altitude can ever produce.
    expect(maxCoveragePercentForAltitude(11_000, 90)).toBeCloseTo(41.7, 0);
    expect(maxCoveragePercentForAltitude(11_000, 30)).toBeCloseTo(20.8, 0);
  });

  it("clears 50 % for approach traffic", () => {
    expect(maxCoveragePercentForAltitude(900, 30)).toBeGreaterThan(50);
  });

  it("clears 50 % for a widebody only with a high Moon", () => {
    expect(maxCoveragePercentForAltitude(11_000, 20, 79.8)).toBeLessThan(50);
    expect(maxCoveragePercentForAltitude(11_000, 45, 79.8)).toBeGreaterThan(50);
  });
});
