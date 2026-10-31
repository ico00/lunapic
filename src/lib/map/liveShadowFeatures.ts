import type { LiveShadowTrack } from "@/lib/domain/geometry/liveShadowTrack";
import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import type { Feature, FeatureCollection } from "geojson";

/**
 * Map geometry for the live "stand here" centerline of the selected aircraft.
 *
 * Emerald = where to stand, amber = time, with minute ticks along the line.
 * Without them the line reads as a place, and it is not — it is a place
 * *per instant*, sweeping past at the aircraft's ground speed.
 */

const ELLIPSE_SEGMENTS = 72;

/**
 * Closed ring for the tolerance ellipse: semi-minor across the Moon's azimuth,
 * semi-major along it, since stepping toward or away from the Moon barely
 * changes the line of sight while stepping sideways changes it directly.
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

const TICK_INTERVAL_SEC = 60;

export type LiveShadowFeaturePack = {
  /** Current spot + its tolerance ellipse. */
  readonly spot: FeatureCollection;
  /** The centerline plus one labelled tick per minute. */
  readonly path: FeatureCollection;
};

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export function buildLiveShadowFeatures(
  track: LiveShadowTrack | null
): LiveShadowFeaturePack {
  if (!track || track.samples.length === 0) {
    return { spot: EMPTY, path: EMPTY };
  }

  const spotFeatures: Feature[] = [];
  const now = track.now;
  if (now) {
    spotFeatures.push({
      type: "Feature",
      properties: {
        kind: "tolerance",
        crossTrackM: Math.round(now.spot.crossTrackToleranceMeters),
        alongTrackM: Math.round(now.spot.alongTrackToleranceMeters),
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          buildToleranceEllipseRing(
            now.spot.lat,
            now.spot.lng,
            now.spot.moonAzimuthDeg,
            now.spot.crossTrackToleranceMeters,
            now.spot.alongTrackToleranceMeters
          ),
        ],
      },
    });
    spotFeatures.push({
      type: "Feature",
      properties: {
        kind: "spot",
        flightId: track.flightId,
        label: `${Math.round(now.spot.coveragePercent)}%`,
      },
      geometry: { type: "Point", coordinates: [now.spot.lng, now.spot.lat] },
    });
  }

  const pathFeatures: Feature[] = [];
  if (track.samples.length >= 2) {
    pathFeatures.push({
      type: "Feature",
      properties: { kind: "path", flightId: track.flightId },
      geometry: {
        type: "LineString",
        coordinates: track.samples.map((s) => [s.spot.lng, s.spot.lat]),
      },
    });
  }
  for (const sample of track.samples) {
    if (sample.offsetSec === 0 || sample.offsetSec % TICK_INTERVAL_SEC !== 0) {
      continue;
    }
    pathFeatures.push({
      type: "Feature",
      properties: {
        kind: "tick",
        offsetSec: sample.offsetSec,
        label: `+${sample.offsetSec / 60}m`,
      },
      geometry: { type: "Point", coordinates: [sample.spot.lng, sample.spot.lat] },
    });
  }

  return {
    spot: { type: "FeatureCollection", features: spotFeatures },
    path: { type: "FeatureCollection", features: pathFeatures },
  };
}
