"use client";

import { FlightAltitudeLegend } from "@/components/map/FlightAltitudeLegend";
import { MapDisplayModeLayersControl } from "@/components/map/MapDisplayModeLayersControl";
import { SelectedAircraftMapPopup } from "@/components/map/SelectedAircraftMapPopup";
import { useCurrentMoonAzimuthFeature } from "@/hooks/useCurrentMoonAzimuthFeature";
import { FieldPerfOverlay } from "@/components/perf/FieldPerfOverlay";
import { useExtrapolatedFlightsForMap } from "@/hooks/useExtrapolatedFlightsForMap";
import { useMapFlightPick } from "@/hooks/useMapFlightPick";
import { useMapFlightAltitudeColorsPaint } from "@/hooks/useMapFlightAltitudeColorsPaint";
import { useMapGeoJsonSync } from "@/hooks/useMapGeoJsonSync";
import { useMapDisplayMode } from "@/hooks/useMapDisplayMode";
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
import { type FlightFilterCriteria, filterFlightsByCriteria } from "@/lib/flight/flightSearch";
import { ALTITUDE_BANDS } from "@/lib/map/flightAltitudeColor";
import { fieldPerfRecord, isFieldPerfEnabled } from "@/lib/perf/fieldPerf";
import type { IFlightProvider } from "@/types";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { Profiler, useEffect, useMemo } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapContainerProps = {
  flightProvider: IFlightProvider;
  /** Žuta = plava u okviru 0,1° — nisan na markeru, bljesak u roditelju. */
  isGolden?: boolean;
  /** When true, map-linked field sounds (green-zone chime, moon-overlap hold tone). */
  fieldSoundsEnabled?: boolean;
  /** Mobile shell: hide selected-aircraft Mapbox popup while a bottom sheet is open. */
  suppressSelectedAircraftPopup?: boolean;
  flightFilterCriteria: FlightFilterCriteria;
};

export function MapContainer({
  flightProvider,
  isGolden = false,
  fieldSoundsEnabled = false,
  suppressSelectedAircraftPopup = false,
  flightFilterCriteria,
}: MapContainerProps) {
  const flights = useExtrapolatedFlightsForMap();
  const observer = useObserverStore((s) => s.observer);
  const moon = useMoonStateComputed();
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const setSelectedFlightId = useMoonTransitStore((s) => s.setSelectedFlightId);
  const cameraFocalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const cameraSensorType = useMoonTransitStore((s) => s.cameraSensorType);
  const mapDisplayMode = useMoonTransitStore((s) => s.mapDisplayMode);
  const altitudeBandIndex = useMoonTransitStore((s) => s.altitudeBandIndex);

  const filteredFlights = useMemo(() => {
    const byCriteria = filterFlightsByCriteria(flights, flightFilterCriteria);
    if (altitudeBandIndex === 0) return byCriteria;
    const band = ALTITUDE_BANDS[altitudeBandIndex - 1];
    if (!band) return byCriteria;
    return byCriteria.filter((f) => {
      const alt = f.geoAltitudeMeters ?? 0;
      return alt >= band.minMeters && alt < band.maxMeters;
    });
  }, [flights, flightFilterCriteria, altitudeBandIndex]);

  useEffect(() => {
    if (selectedFlightId == null) {
      return;
    }
    if (!filteredFlights.some((f) => f.id === selectedFlightId)) {
      setSelectedFlightId(null);
    }
  }, [filteredFlights, selectedFlightId, setSelectedFlightId]);

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
    refreshFlightsNow,
  } = useMoonTransitMap({ flightProvider, isGolden });
  const shotFeasibleFlightIds = useMemo(
    () =>
      computeShotFeasibleFlightIds(
        observer,
        moon,
        filteredFlights,
        cameraFocalLengthMm,
        cameraSensorType as CameraSensorType
      ),
    [cameraFocalLengthMm, cameraSensorType, filteredFlights, moon, observer]
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
      extrapolatedFlights: filteredFlights,
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
      flights: filteredFlights,
    });

  useMapFlightAltitudeColorsPaint(mapRef, mapReadyTick);
  useMapDisplayMode(mapRef, mapReadyTick);

  useMapGeoJsonSync({
    mapRef,
    mapReadyTick,
    moonAzFeature,
    moonAzNowFeature,
    moonAzNowLabelFeature,
    intersectionFeatures,
    optimalGroundFeatures,
    moonPathPack,
    flights: filteredFlights,
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
    <div
      className="pointer-events-auto relative h-full w-full overflow-visible"
      data-testid="map-surface"
    >
      <div ref={elRef} className="h-full w-full" />
      {mapDisplayMode === "atc" ? (
        <div className="pointer-events-none absolute inset-0 z-[8] bg-gradient-to-b from-sky-500/18 via-blue-700/22 to-indigo-950/30 mix-blend-screen" />
      ) : null}
      <div className="pointer-events-none md:contents max-md:fixed max-md:bottom-[calc(8.25rem+env(safe-area-inset-bottom,0px))] max-md:left-3 max-md:right-3 max-md:z-[76] max-md:flex max-md:items-stretch max-md:gap-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
        <MapDisplayModeLayersControl />
        <FlightAltitudeLegend />
      </div>
      <FieldPerfOverlay />
      <SelectedAircraftMapPopup
        mapRef={mapRef}
        mapReadyTick={mapReadyTick}
        suppressed={suppressSelectedAircraftPopup}
        onRefreshFlights={refreshFlightsNow}
      />
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