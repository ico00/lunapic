import { buildShortFlightTrajectoryFeature } from "@/lib/domain/geometry/flightTrajectory";
import type { FlightState } from "@/types/flight";
import type { Feature, LineString, Point } from "geojson";
import { useMemo } from "react";

type UseSelectedFlightTrajectoryFeatureArgs = {
  selectedFlightId: string | null;
  flights: readonly FlightState[];
};

type SelectedFlightTrajectoryPack = {
  lineFeature: Feature<LineString> | null;
  labelFeature: Feature<Point> | null;
};

export function useSelectedFlightTrajectoryFeature(
  a: UseSelectedFlightTrajectoryFeatureArgs
): SelectedFlightTrajectoryPack {
  const { selectedFlightId, flights } = a;

  return useMemo(() => {
    if (selectedFlightId == null) {
      return { lineFeature: null, labelFeature: null };
    }
    const selected = flights.find((f) => f.id === selectedFlightId);
    if (!selected) {
      return { lineFeature: null, labelFeature: null };
    }
    const lineFeature = buildShortFlightTrajectoryFeature(selected);
    if (!lineFeature) {
      return { lineFeature: null, labelFeature: null };
    }
    const coords = lineFeature.geometry.coordinates;
    const endCoord = coords[coords.length - 1];
    const horizonSecRaw = lineFeature.properties?.horizonSec;
    const horizonSec =
      typeof horizonSecRaw === "number" && Number.isFinite(horizonSecRaw)
        ? Math.round(horizonSecRaw)
        : 90;
    const labelFeature: Feature<Point> = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: endCoord,
      },
      properties: {
        label: `+${horizonSec}s`,
      },
    };
    return { lineFeature, labelFeature };
  }, [flights, selectedFlightId]);
}
