import {
  buildStandCorridorStripFeatures,
  normBearing360,
} from "@/lib/domain/geometry/standCorridorQuads";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import {
  SELECTED_STAND_FAR_M,
  SELECTED_STAND_NEAR_M,
  SELECTED_STAND_HALF_WIDTH_M,
} from "@/lib/map/mapOverlayConstants";
import type { GroundObserver } from "@/types";
import type { FlightState } from "@/types/flight";
import type { Feature } from "geojson";
import { useMemo } from "react";

type Args = {
  observer: GroundObserver;
  extrapolatedFlights: readonly FlightState[];
  feasibleFlightIds: ReadonlySet<string>;
};

/**
 * Persistent confirmed zones for all currently feasible flights (camera + moon + geometry).
 */
export function useConfirmedPhotoZoneFeatures(a: Args): readonly Feature[] {
  const { observer, extrapolatedFlights, feasibleFlightIds } = a;
  return useMemo(() => {
    if (feasibleFlightIds.size === 0) {
      return [];
    }
    const out: Feature[] = [];
    const p = {
      nearAlongM: SELECTED_STAND_NEAR_M,
      farAlongM: SELECTED_STAND_FAR_M,
      halfWidthM: SELECTED_STAND_HALF_WIDTH_M,
    };
    for (const flight of extrapolatedFlights) {
      if (!feasibleFlightIds.has(flight.id)) {
        continue;
      }
      const h = flight.geoAltitudeMeters ?? flight.baroAltitudeMeters;
      if (h == null) {
        continue;
      }
      const hObs = horizontalToPoint(
        observer,
        flight.position.lat,
        flight.position.lng,
        h
      );
      const standBearingDeg = normBearing360(hObs.azimuthDeg + 180);
      const strips = buildStandCorridorStripFeatures(
        [
          {
            groundLat: flight.position.lat,
            groundLng: flight.position.lng,
            standBearingDeg,
          },
        ],
        p
      );
      for (const s of strips) {
        out.push({
          ...s,
          properties: {
            ...(s.properties ?? {}),
            kind: "confirmedZone",
            flightId: flight.id,
          },
        });
      }
    }
    return out;
  }, [observer, extrapolatedFlights, feasibleFlightIds]);
}

