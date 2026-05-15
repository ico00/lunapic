import {
  buildStandCorridorObserverVolumeFeature,
  buildStandCorridorSpineLineFeature,
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

const AZIMUTH_THRESHOLD_DEG = 25;

type Args = {
  selectedFlightId: string | null;
  extrapolatedFlights: readonly FlightState[];
  observer: GroundObserver;
  moonAltitudeDeg: number;
  moonAzimuthDeg: number;
};

export type SelectedStandCorridorPack = {
  /** Jedan poligon za T=0 (simulirano vrijeme klizača). */
  fillFeatures: readonly Feature[];
  /** Središnja os trake (3D LoS na tlo); `null` ako nema poligona. */
  spineFeature: Feature | null;
};

/**
 * T=0: jedna tlocrtna traka za `referenceEpochMs`, s visinom zrakoplova u azimutu
 * (`horizontalToPoint` → tlocrtni back-azimuth). Cijan traka + „zero offset” crtež.
 * `referenceEpochMs` (klizač) već unosi ekstrapolirano mjesto u `extrapolatedFlights`.
 */
export function useSelectedAircraftStandCorridorFeatures(
  a: Args
): SelectedStandCorridorPack {
  const {
    selectedFlightId,
    extrapolatedFlights,
    observer,
    moonAltitudeDeg,
    moonAzimuthDeg,
  } = a;

  return useMemo(() => {
    if (selectedFlightId == null) {
      return { fillFeatures: [], spineFeature: null };
    }
    const flight = extrapolatedFlights.find((f) => f.id === selectedFlightId);
    if (!flight) {
      return { fillFeatures: [], spineFeature: null };
    }
    const h = flight.geoAltitudeMeters ?? flight.baroAltitudeMeters;
    if (h == null) {
      return { fillFeatures: [], spineFeature: null };
    }
    const v = flight.groundSpeedMps ?? 200;
    if (v < 1) {
      return { fillFeatures: [], spineFeature: null };
    }

    const hObs = horizontalToPoint(
      observer,
      flight.position.lat,
      flight.position.lng,
      h
    );

    // Hide blue volume when aircraft azimuth diverges too much from moon azimuth
    const azDiff = Math.abs(((hObs.azimuthDeg - moonAzimuthDeg + 540) % 360) - 180);
    if (azDiff > AZIMUTH_THRESHOLD_DEG) {
      return { fillFeatures: [], spineFeature: null };
    }

    const standBearingDeg = normBearing360(hObs.azimuthDeg + 180);
    const sample = {
      groundLat: flight.position.lat,
      groundLng: flight.position.lng,
      standBearingDeg,
    };
    const p = {
      nearAlongM: SELECTED_STAND_NEAR_M,
      farAlongM: SELECTED_STAND_FAR_M,
      halfWidthM: SELECTED_STAND_HALF_WIDTH_M,
    };
    const stripFeatures = buildStandCorridorStripFeatures([sample], p);
    const moonAltClamped = Math.max(2, Math.min(70, moonAltitudeDeg));
    const volumeHeightMeters = Math.min(
      30_000,
      Math.max(
        250,
        Math.tan((moonAltClamped * Math.PI) / 180) * SELECTED_STAND_FAR_M
      )
    );
    const volumeFeature = buildStandCorridorObserverVolumeFeature(
      observer,
      sample,
      p,
      volumeHeightMeters
    );
    const fillFeatures = [...stripFeatures, volumeFeature];
    const spineFeature = buildStandCorridorSpineLineFeature(sample, p, observer);
    return { fillFeatures, spineFeature };
  }, [
    selectedFlightId,
    extrapolatedFlights,
    observer,
    moonAltitudeDeg,
    moonAzimuthDeg,
  ]);
}
