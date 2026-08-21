import { describe, expect, it } from "vitest";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import { initialBearingDeg } from "@/lib/domain/geometry/wgs84";
import type { PhotoSpotOpportunity } from "@/types/photoSpot";
import {
  buildCircleRing,
  buildPhotoSpotFeatures,
  buildToleranceEllipseRing,
} from "./photoSpotFeatures";

const SPOT: PhotoSpotOpportunity = {
  callsign: "CTN414",
  atMs: Date.UTC(2026, 7, 22, 16, 15),
  stdMinutes: 4,
  sessionCount: 4,
  trackSessionCount: 3,
  weekdays: [1, 3, 5],
  lat: 45.83,
  lng: 16.08,
  distanceFromObserverM: 1500,
  bearingFromObserverDeg: 132,
  coveragePercent: 77,
  slantKm: 6,
  moonAltDeg: 8.2,
  moonAzDeg: 140,
  crossTrackToleranceM: 26,
  alongTrackToleranceM: 182,
  trackSpreadM: 655,
  confidence: "low",
  path: [
    [16.05, 45.8, -30],
    [16.08, 45.83, 0],
    [16.11, 45.86, 30],
  ],
};

describe("buildToleranceEllipseRing", () => {
  it("is widest along the Moon's azimuth and narrowest across it", () => {
    const ring = buildToleranceEllipseRing(SPOT.lat, SPOT.lng, SPOT.moonAzDeg, 26, 182);
    const distances = ring.map(([lng, lat]) =>
      greatCircleDistanceMeters(SPOT.lat, SPOT.lng, lat, lng)
    );
    expect(Math.max(...distances)).toBeCloseTo(182, -1);
    expect(Math.min(...distances)).toBeCloseTo(26, -1);
  });

  it("puts its long axis on the Moon's bearing", () => {
    const ring = buildToleranceEllipseRing(SPOT.lat, SPOT.lng, SPOT.moonAzDeg, 26, 182);
    let farthest = ring[0]!;
    let farthestM = 0;
    for (const [lng, lat] of ring) {
      const d = greatCircleDistanceMeters(SPOT.lat, SPOT.lng, lat, lng);
      if (d > farthestM) {
        farthestM = d;
        farthest = [lng, lat];
      }
    }
    const bearing = initialBearingDeg([SPOT.lat, SPOT.lng], [farthest[1], farthest[0]]);
    // Either end of the long axis is fine — it is an axis, not a direction.
    const delta = Math.min(
      Math.abs(((bearing - SPOT.moonAzDeg + 540) % 360) - 180),
      Math.abs(((bearing - SPOT.moonAzDeg + 360) % 360) - 0)
    );
    expect(Math.min(delta, 180 - delta)).toBeLessThan(2);
  });

  it("closes the ring", () => {
    const ring = buildToleranceEllipseRing(SPOT.lat, SPOT.lng, 140, 26, 182);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});

describe("buildCircleRing", () => {
  it("keeps every vertex at the requested radius", () => {
    const ring = buildCircleRing(SPOT.lat, SPOT.lng, 655);
    for (const [lng, lat] of ring) {
      expect(greatCircleDistanceMeters(SPOT.lat, SPOT.lng, lat, lng)).toBeCloseTo(655, -1);
    }
  });
});

describe("buildPhotoSpotFeatures", () => {
  it("returns empty collections without a selection", () => {
    const pack = buildPhotoSpotFeatures(null);
    expect(pack.spot.features).toHaveLength(0);
    expect(pack.path.features).toHaveLength(0);
  });

  it("orders spread, tolerance, then the point so the small shapes stay on top", () => {
    const pack = buildPhotoSpotFeatures(SPOT);
    expect(pack.spot.features.map((f) => f.properties?.kind)).toEqual([
      "spread",
      "tolerance",
      "spot",
    ]);
    expect(pack.path.features).toHaveLength(1);
  });

  it("drops the shadow path when there are too few samples to draw a line", () => {
    const pack = buildPhotoSpotFeatures({ ...SPOT, path: [[16.08, 45.83, 0]] });
    expect(pack.path.features).toHaveLength(0);
  });

  it("omits the spread circle when the track has no measured scatter", () => {
    const pack = buildPhotoSpotFeatures({ ...SPOT, trackSpreadM: 0 });
    expect(pack.spot.features.map((f) => f.properties?.kind)).toEqual(["tolerance", "spot"]);
  });
});
