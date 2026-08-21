import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import type { PhotoSpotOpportunity } from "@/types/photoSpot";
import type { Feature, FeatureCollection } from "geojson";

/**
 * Map geometry for one "stand here" opportunity.
 *
 * Three shapes, deliberately at three different scales, because the honest
 * picture needs all three side by side:
 *  - the **tolerance ellipse** (tens of metres) — where you must actually
 *    stand. Stretched along the Moon's azimuth by `1/sin(altitude)`, since
 *    stepping toward or away from the Moon barely changes the line of sight
 *    while stepping sideways changes it directly;
 *  - the **spread circle** (hundreds of metres to kilometres) — how much the
 *    callsign's own track wanders between passes, i.e. how much of a lottery
 *    the ellipse is;
 *  - the **shadow path** — where the spot was and will be, sweeping the ground
 *    at the aircraft's ground speed.
 */

const ELLIPSE_SEGMENTS = 72;

/**
 * Closed ring for the tolerance ellipse: semi-minor across the Moon's azimuth,
 * semi-major along it.
 */
export function buildToleranceEllipseRing(
  lat: number,
  lng: number,
  moonAzimuthDeg: number,
  crossTrackMeters: number,
  alongTrackMeters: number,
  segments = ELLIPSE_SEGMENTS
): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * 2 * Math.PI;
    // Local frame: +along = toward the Moon, +cross = 90° right of it.
    const along = alongTrackMeters * Math.cos(t);
    const cross = crossTrackMeters * Math.sin(t);
    const stepped = destinationByAzimuthMeters(lat, lng, moonAzimuthDeg, along);
    const p = destinationByAzimuthMeters(
      stepped.lat,
      stepped.lng,
      (moonAzimuthDeg + 90) % 360,
      cross
    );
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

/** Closed ring approximating a circle of `radiusMeters` around a point. */
export function buildCircleRing(
  lat: number,
  lng: number,
  radiusMeters: number,
  segments = ELLIPSE_SEGMENTS
): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const bearing = (i / segments) * 360;
    const p = destinationByAzimuthMeters(lat, lng, bearing, radiusMeters);
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

export type PhotoSpotFeaturePack = {
  /** Point + tolerance ellipse + spread circle. */
  readonly spot: FeatureCollection;
  /** The moving spot's ground track, with a vertex per sampled second. */
  readonly path: FeatureCollection;
};

export function buildPhotoSpotFeatures(
  opportunity: PhotoSpotOpportunity | null
): PhotoSpotFeaturePack {
  const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
  if (!opportunity) {
    return { spot: empty, path: empty };
  }

  const {
    lat,
    lng,
    moonAzDeg,
    crossTrackToleranceM,
    alongTrackToleranceM,
    trackSpreadM,
    callsign,
    coveragePercent,
    confidence,
    path,
  } = opportunity;

  const features: Feature[] = [];

  // Widest first so the small shapes stay on top.
  if (trackSpreadM > 0) {
    features.push({
      type: "Feature",
      properties: { kind: "spread", spreadM: trackSpreadM },
      geometry: {
        type: "Polygon",
        coordinates: [buildCircleRing(lat, lng, trackSpreadM)],
      },
    });
  }
  features.push({
    type: "Feature",
    properties: {
      kind: "tolerance",
      crossTrackM: crossTrackToleranceM,
      alongTrackM: alongTrackToleranceM,
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        buildToleranceEllipseRing(
          lat,
          lng,
          moonAzDeg,
          crossTrackToleranceM,
          alongTrackToleranceM
        ),
      ],
    },
  });
  features.push({
    type: "Feature",
    properties: {
      kind: "spot",
      callsign,
      confidence,
      label: `${callsign} · ${Math.round(coveragePercent)}%`,
    },
    geometry: { type: "Point", coordinates: [lng, lat] },
  });

  const pathFeatures: Feature[] =
    path.length >= 2
      ? [
          {
            type: "Feature",
            properties: { kind: "shadowPath", callsign },
            geometry: {
              type: "LineString",
              coordinates: path.map(([pathLng, pathLat]) => [pathLng, pathLat]),
            },
          },
        ]
      : [];

  return {
    spot: { type: "FeatureCollection", features },
    path: { type: "FeatureCollection", features: pathFeatures },
  };
}
