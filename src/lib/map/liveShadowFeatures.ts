import type { LiveShadowTrack } from "@/lib/domain/geometry/liveShadowTrack";
import type { Feature, FeatureCollection } from "geojson";
import { buildToleranceEllipseRing } from "./photoSpotFeatures";

/**
 * Map geometry for the live "stand here" centerline of the selected aircraft.
 *
 * Same visual language as the forecast spot (emerald = where to stand, amber =
 * time), with one addition the forecast does not need: minute ticks along the
 * line. Without them the line reads as a place, and it is not — it is a place
 * *per instant*, sweeping past at the aircraft's ground speed.
 */

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
