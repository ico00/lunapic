"use client";

import { FlightAltitudeLegend } from "@/components/map/FlightAltitudeLegend";
import { SelectedAircraftMapPopup } from "@/components/map/SelectedAircraftMapPopup";
import { useCurrentMoonAzimuthFeature } from "@/hooks/useCurrentMoonAzimuthFeature";
import { FieldPerfOverlay } from "@/components/perf/FieldPerfOverlay";
import { useExtrapolatedFlightsForMap } from "@/hooks/useExtrapolatedFlightsForMap";
import { useMapFlightPick } from "@/hooks/useMapFlightPick";
import { useMapFlightAltitudeColorsPaint } from "@/hooks/useMapFlightAltitudeColorsPaint";
import { useMapGeoJsonSync } from "@/hooks/useMapGeoJsonSync";
import { useMapMoonHorizonDeemphasis } from "@/hooks/useMapMoonHorizonDeemphasis";
import { useMapMoonOverlayFeatures } from "@/hooks/useMapMoonOverlayFeatures";
import { useMoonTransitMap } from "@/hooks/useMoonTransitMap";
import { useSelectedFlightTrajectoryFeature } from "@/hooks/useSelectedFlightTrajectoryFeature";
import { useSelectedAircraftStandCorridorFeatures } from "@/hooks/useSelectedAircraftStandCorridorFeatures";
import { useTransitOpportunityCorridorFeatures } from "@/hooks/useTransitOpportunityCorridorFeatures";
import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import { useTransitFieldSounds } from "@/hooks/useTransitFieldSounds";
import { isMoonVisibleFromMoonState } from "@/lib/domain/astro/moonVisibility";
import { type CameraSensorType } from "@/lib/domain/geometry/shotFeasibility";
import { computeShotFeasibleFlightIds } from "@/lib/domain/transit/computeShotFeasibleFlightIds";
import { fieldPerfRecord, isFieldPerfEnabled } from "@/lib/perf/fieldPerf";
import type { IFlightProvider } from "@/types";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { Profiler, useMemo } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapContainerProps = {
  flightProvider: IFlightProvider;
  /** Žuta = plava u okviru 0,1° — nisan na markeru, bljesak u roditelju. */
  isGolden?: boolean;
  /** When true, map-linked field sounds (green-zone chime, moon-overlap hold tone). */
  fieldSoundsEnabled?: boolean;
};

export function MapContainer({
  flightProvider,
  isGolden = false,
  fieldSoundsEnabled = false,
}: MapContainerProps) {
  const flights = useExtrapolatedFlightsForMap();
  const observer = useObserverStore((s) => s.observer);
  const moon = useMoonStateComputed();
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const cameraFocalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const cameraSensorType = useMoonTransitStore((s) => s.cameraSensorType);

  const { moonPathPack, moonAzFeature, intersectionFeatures, optimalGroundFeatures } =
    useMapMoonOverlayFeatures(
      observer.lat,
      observer.lng,
      referenceEpochMs,
      moon
    );
  const { lineFeature: moonAzNowFeature, labelFeature: moonAzNowLabelFeature } =
    useCurrentMoonAzimuthFeature(observer.lat, observer.lng);

  const {
    hasMapboxToken,
    elRef,
    mapRef,
    mapReadyTick,
  } = useMoonTransitMap({ flightProvider, isGolden });
  const shotFeasibleFlightIds = useMemo(
    () =>
      computeShotFeasibleFlightIds(
        observer,
        moon,
        flights,
        cameraFocalLengthMm,
        cameraSensorType as CameraSensorType
      ),
    [cameraFocalLengthMm, cameraSensorType, flights, moon, observer]
  );

  useTransitFieldSounds({
    enabled: fieldSoundsEnabled,
    selectedFlightId,
    observer,
    moon,
    flights,
    cameraFocalLengthMm,
    cameraSensorType: cameraSensorType as CameraSensorType,
  });
  const { fillFeatures: standCorridorFeatures, spineFeature: standSpineFeature } =
    useSelectedAircraftStandCorridorFeatures({
      selectedFlightId,
      extrapolatedFlights: flights,
      observer,
      moonAltitudeDeg: moon.altitudeDeg,
    });
  const transitOpportunityCorridorFeatures = useTransitOpportunityCorridorFeatures({
    observer,
    moon,
    cameraFocalLengthMm,
    cameraSensorType: cameraSensorType as CameraSensorType,
  });
  const { lineFeature: selectedFlightTrajectoryFeature, labelFeature: selectedFlightTrajectoryLabelFeature } =
    useSelectedFlightTrajectoryFeature({
      selectedFlightId,
      flights,
    });

  useMapFlightAltitudeColorsPaint(mapRef, mapReadyTick);

  useMapGeoJsonSync({
    mapRef,
    mapReadyTick,
    moonAzFeature,
    moonAzNowFeature,
    moonAzNowLabelFeature,
    intersectionFeatures,
    optimalGroundFeatures,
    moonPathPack,
    flights,
    selectedFlightId,
    standCorridorFeatures: [
      ...standCorridorFeatures,
      ...transitOpportunityCorridorFeatures,
    ],
    standSpineFeature,
    selectedFlightTrajectoryFeature,
    selectedFlightTrajectoryLabelFeature,
    shotFeasibleFlightIds,
    flightProvider,
  });

  useMapFlightPick(mapRef, mapReadyTick);

  const moonBelowHorizon = !isMoonVisibleFromMoonState(moon);
  useMapMoonHorizonDeemphasis(mapRef, mapReadyTick, moonBelowHorizon);

  if (!hasMapboxToken) {
    return (
      <div
        data-testid="map-missing-token"
        className="flex h-full items-center justify-center bg-gradient-to-b from-black via-zinc-900 to-black px-4 text-center text-sm text-yellow-400/90 ring-1 ring-inset ring-zinc-700"
      >
        Set <code className="mx-1 rounded bg-zinc-800 px-1.5 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> in
        .env.local
      </div>
    );
  }

  const mapColumn = (
    <div className="relative h-full w-full" data-testid="map-surface">
      <div ref={elRef} className="h-full w-full" />
      <FlightAltitudeLegend />
      <FieldPerfOverlay />
      <SelectedAircraftMapPopup mapRef={mapRef} mapReadyTick={mapReadyTick} />
    </div>
  );

  if (isFieldPerfEnabled()) {
    return (
      <Profiler
        id="MapBlock"
        onRender={(_id, phase, actualDuration) => {
          if (Number.isFinite(actualDuration)) {
            fieldPerfRecord(`react:MapBlock:${phase}`, actualDuration);
          }
        }}
      >
        {mapColumn}
      </Profiler>
    );
  }

  return mapColumn;
}