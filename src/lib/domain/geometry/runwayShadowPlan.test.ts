import { describe, expect, it } from "vitest";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import {
  aircraftHeightAboveAirportM,
  buildPlanSampleTimes,
  computeRunwayShadowPlan,
} from "./runwayShadowPlan";

/** 28.10.2026 07:20 CET (UTC+1, ljetno računanje završilo 25.10.). */
const AT_0720 = Date.UTC(2026, 9, 28, 6, 20, 0);

/**
 * Referentne točke iz ručno izrađenog KML-a `LDZA_mjesec_28-10_jutro.kml`
 * (isti dan i vrijeme) — planer mora dati iste točke na tlu.
 */
const KML_APPROACH_0720 = [
  { km: 6, lat: 45.692541, lng: 16.007416 },
  { km: 8, lat: 45.679454, lng: 15.992386 },
  { km: 10, lat: 45.666363, lng: 15.977363 },
  { km: 12, lat: 45.65327, lng: 15.962347 },
];
const KML_DEPARTURE_0720_6KM = { lat: 45.689328, lng: 16.02245 };

function plan(flow: "landing04" | "departure22", minCoveragePercent = 0) {
  return computeRunwayShadowPlan({
    startMs: AT_0720,
    endMs: AT_0720,
    stepMs: 600_000,
    flows: [flow],
    minCoveragePercent,
  });
}

describe("computeRunwayShadowPlan", () => {
  it("reproduces the hand-made KML approach points (07:20, 3° glide)", () => {
    const [line] = plan("landing04");
    expect(line).toBeDefined();
    expect(line!.moonAltitudeDeg).toBeCloseTo(19, 0);
    expect(line!.moonAzimuthDeg).toBeCloseTo(287, 0);
    for (const ref of KML_APPROACH_0720) {
      const p = line!.points.find((q) => Math.abs(q.distanceKm - ref.km) < 1e-9)!;
      expect(p, `${ref.km} km`).toBeDefined();
      // Tolerancija ~ pola poprečne tolerancije elipse: znatno ispod širine na kojoj
      // se avion još vidi na disku, dakle KML i planer se slažu u svemu bitnom.
      expect(greatCircleDistanceMeters(p.lat, p.lng, ref.lat, ref.lng)).toBeLessThan(60);
    }
  });

  it("matches KML coverage: A320 at 6 km is ~4× the Moon", () => {
    const [line] = plan("landing04");
    const p = line!.points.find((q) => q.distanceKm === 6)!;
    expect(p.coveragePercent / 100).toBeGreaterThan(3.7);
    expect(p.coveragePercent / 100).toBeLessThan(4.5);
  });

  it("matches the KML departure point at 6 km", () => {
    const [line] = plan("departure22");
    const p = line!.points.find((q) => q.distanceKm === 6)!;
    expect(greatCircleDistanceMeters(p.lat, p.lng, KML_DEPARTURE_0720_6KM.lat, KML_DEPARTURE_0720_6KM.lng))
      .toBeLessThan(80);
  });

  it("drops points under the coverage floor and nothing above it", () => {
    const all = plan("landing04")[0]!.points;
    const filtered = plan("landing04", 250)[0]!.points;
    expect(filtered.length).toBeLessThan(all.length);
    expect(filtered.every((p) => p.coveragePercent >= 250)).toBe(true);
    // Strma gornja granica ne postoji: najbliža točka (najveća pokrivenost) ostaje.
    expect(filtered[0]!.coveragePercent).toBe(Math.max(...all.map((p) => p.coveragePercent)));
  });

  it("returns nothing when the Moon is below the 5° floor", () => {
    // 28.10.2026 u 12:00 UTC Mjesec je dobro iznad horizonta, a u 05:00 UTC
    // nakon zalaska (puni Mjesec je 26.10.). Biramo poslijepodne: ispod horizonta.
    const below = computeRunwayShadowPlan({
      startMs: Date.UTC(2026, 9, 28, 12, 0, 0),
      endMs: Date.UTC(2026, 9, 28, 12, 0, 0),
      stepMs: 600_000,
      flows: ["landing04", "departure22"],
      minCoveragePercent: 0,
    });
    expect(below).toEqual([]);
  });

  it("marks only the 4/6/8/10/12 km points as markers", () => {
    const [line] = plan("landing04");
    const markers = line!.points.filter((p) => p.isMarker).map((p) => p.distanceKm);
    expect(markers).toEqual([4, 6, 8, 10, 12]);
  });
});

describe("aircraftHeightAboveAirportM", () => {
  it("follows 3° + 15 m threshold crossing height on approach", () => {
    expect(aircraftHeightAboveAirportM("landing04", 6000)).toBeCloseTo(329.4, 0);
    expect(aircraftHeightAboveAirportM("landing04", 12_000)).toBeCloseTo(643.6, 0);
  });

  it("climbs on departure close to the hand-made ~745 m at 6 km", () => {
    const h = aircraftHeightAboveAirportM("departure22", 6000);
    expect(h).toBeGreaterThan(720);
    expect(h).toBeLessThan(770);
  });
});

describe("buildPlanSampleTimes", () => {
  it("includes both ends when the step divides the span", () => {
    expect(buildPlanSampleTimes(0, 30, 10)).toEqual([0, 10, 20, 30]);
  });
  it("is empty for a negative span or non-positive step", () => {
    expect(buildPlanSampleTimes(10, 0, 5)).toEqual([]);
    expect(buildPlanSampleTimes(0, 10, 0)).toEqual([]);
  });
});
