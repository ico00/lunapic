import { describe, expect, it, vi } from "vitest";
import * as moonModule from "../astro/moon";
import { getMoonState, getMoonPosition } from "../astro/moon";
import { destinationByAzimuthMeters, initialBearingDeg } from "./wgs84";
import { horizontalToPoint } from "./horizontal";
import { photographerPack } from "./geometryEnginePhotographer";
import { solveAzimuthAlignment, ALIGNMENT_RESIDUAL_DEG } from "./azimuthAlignment";

const observer = { lat: 45.8, lng: 15.98, groundHeightMeters: 0 };
const at = new Date("2019-01-15T18:00:00Z");
const moon = getMoonState(at, observer.lat, observer.lng);

/** Construct a trajectory through the actual Moon direction at t=60s.
 * Reverse projection and bearing give an independently known crossing time.
 */
function realTransit(timeSec = 60) {
  const future = getMoonPosition(new Date(+at + timeSec * 1000), observer.lat, observer.lng);
  const crossing = destinationByAzimuthMeters(observer.lat, observer.lng, future.azimuthDeg, 10_000);
  // Use actual ECEF azimuth: spherical destination bearing differs slightly.
  let bearing = future.azimuthDeg;
  let p = crossing;
  for (let i = 0; i < 5; i++) {
    const sky = horizontalToPoint(observer, p.lat, p.lng, 14_000);
    bearing += future.azimuthDeg - sky.azimuthDeg;
    p = destinationByAzimuthMeters(observer.lat, observer.lng, bearing, 10_000);
  }
  let lo = 0, hi = 50_000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (horizontalToPoint(observer, p.lat, p.lng, mid).altitudeDeg < future.altitudeDeg) lo = mid;
    else hi = mid;
  }
  const start = destinationByAzimuthMeters(p.lat, p.lng, 270, 200 * timeSec);
  return {
    position: start,
    geoAltitudeMeters: (lo + hi) / 2, baroAltitudeMeters: null,
    trackDeg: initialBearingDeg([start.lat, start.lng], [p.lat, p.lng]), groundSpeedMps: 200,
  };
}

describe("verified azimuth alignment", () => {
  it("rejects the reproduced false disc transit at 43.5 seconds", () => {
    const flight = { position: destinationByAzimuthMeters(observer.lat, observer.lng, 260, 5000),
      geoAltitudeMeters: 10000, baroAltitudeMeters: null, groundSpeedMps: 200, trackDeg: 135 };
    const pack = photographerPack(observer, flight, moon, at)!;
    expect(pack.willActuallyTransit).toBe(false);
    expect(pack.timeToAlignmentSec).not.toBeCloseTo(43.505, 1);
    if (pack.timeToAlignmentSec != null) {
      expect(pack.separationAtAlignmentDeg).toBeGreaterThan(3);
    }
  });

  it("keeps an independently constructed real transit and correct countdown", () => {
    const pack = photographerPack(observer, realTransit(), moon, at)!;
    expect(pack.timeToAlignmentSec).toBeCloseTo(60, 0);
    expect(pack.willActuallyTransit).toBe(true);
    expect(Math.abs(pack.elevationGapAtAlignmentDeg!)).toBeLessThan(0.005);
    expect(pack.separationAtAlignmentDeg).toBeLessThan(0.005);
  });

  it("does not predict crossings beyond the five-minute horizon", () => {
    expect(photographerPack(observer, realTransit(360), moon, at)?.timeToAlignmentSec).toBeNull();
  });

  it.each(["trackDeg", "groundSpeedMps"] as const)("does not invent missing %s", (key) => {
    expect(photographerPack(observer, { ...realTransit(), [key]: null }, moon, at)).toBeNull();
    expect(photographerPack(observer, { ...realTransit(), [key]: NaN }, moon, at)).toBeNull();
  });

  it("accepts only a verified small azimuth residual", () => {
    const f = realTransit();
    const hit = solveAzimuthAlignment({ observer, position: f.position, altitudeMeters: f.geoAltitudeMeters,
      speedMps: 200, trackDeg: f.trackDeg, atMs: +at });
    expect(hit).not.toBeNull();
    expect(Math.abs(hit!.gap)).toBeLessThanOrEqual(ALIGNMENT_RESIDUAL_DEG);
  });
});


describe("azimuth wrap and opposite ray", () => {
  it.each([0, 180])("handles a crossing at bearing %i with the Moon north", (bearing) => {
    const fakeMoon = { altitudeDeg: 30, azimuthDeg: 0, distanceKm: 380000, apparentRadius: {degrees:0.25} };
    const spy = vi.spyOn(moonModule, "getMoonPosition").mockReturnValue(fakeMoon);
    try {
      const obs = {lat:0,lng:0,groundHeightMeters:0};
      const crossing = destinationByAzimuthMeters(0,0,bearing,10000);
      const start = destinationByAzimuthMeters(crossing.lat,crossing.lng,270,12000);
      const hit = solveAzimuthAlignment({observer:obs,position:start,altitudeMeters:5000,speedMps:200,
        trackDeg:initialBearingDeg([start.lat,start.lng],[crossing.lat,crossing.lng]),atMs:4e12 + bearing*1e6});
      if (bearing === 0) {
        expect(hit?.timeSec).toBeCloseTo(60,0);
        expect(Math.abs(hit!.gap)).toBeLessThanOrEqual(ALIGNMENT_RESIDUAL_DEG);
      } else expect(hit).toBeNull();
    } finally { spy.mockRestore(); }
  });
});
