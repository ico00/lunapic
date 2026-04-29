import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import type { FlightState } from "@/types/flight";
import type { Feature, LineString } from "geojson";

const SHORT_TRAJECTORY_HORIZON_SEC = 90;
const SHORT_TRAJECTORY_STEP_SEC = 10;

/**
 * Kratkoročna predikcija putanje od trenutne pozicije leta.
 * Koristi ground speed + track i daje LineString u GeoJSON [lng, lat] formatu.
 */
export function buildShortFlightTrajectoryFeature(
  flight: FlightState
): Feature<LineString> | null {
  const speedMps = flight.groundSpeedMps;
  const trackDeg = flight.trackDeg;
  if (
    speedMps == null ||
    trackDeg == null ||
    !Number.isFinite(speedMps) ||
    !Number.isFinite(trackDeg) ||
    speedMps < 1
  ) {
    return null;
  }

  const normalizedTrack = ((trackDeg % 360) + 360) % 360;
  const steps = Math.max(
    1,
    Math.floor(SHORT_TRAJECTORY_HORIZON_SEC / SHORT_TRAJECTORY_STEP_SEC)
  );
  const coordinates: [number, number][] = [[
    flight.position.lng,
    flight.position.lat,
  ]];

  for (let i = 1; i <= steps; i += 1) {
    const dtSec = i * SHORT_TRAJECTORY_STEP_SEC;
    const projected = destinationByAzimuthMeters(
      flight.position.lat,
      flight.position.lng,
      normalizedTrack,
      speedMps * dtSec
    );
    coordinates.push([projected.lng, projected.lat]);
  }

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: {
      id: flight.id,
      horizonSec: SHORT_TRAJECTORY_HORIZON_SEC,
      stepSec: SHORT_TRAJECTORY_STEP_SEC,
    },
  };
}
