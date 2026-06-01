"use client";

import { FlightAltitudeLegend } from "@/components/map/FlightAltitudeLegend";
import { MapDisplayModeLayersControl } from "@/components/map/MapDisplayModeLayersControl";
import { SelectedAircraftMapPopup } from "@/components/map/SelectedAircraftMapPopup";
import { useCurrentMoonAzimuthFeature } from "@/hooks/useCurrentMoonAzimuthFeature";
import { FieldPerfOverlay } from "@/components/perf/FieldPerfOverlay";
import { useExtrapolatedFlightsForMap } from "@/hooks/useExtrapolatedFlightsForMap";
import { useCallsignHistoryLayer } from "@/hooks/useCallsignHistoryLayer";
import { useFlightHistoryLayers } from "@/hooks/useFlightHistoryLayers";
import { useSelectedFlightTrail } from "@/hooks/useSelectedFlightTrail";
import { useMapFlightPick } from "@/hooks/useMapFlightPick";
import { useMapFlightAltitudeColorsPaint } from "@/hooks/useMapFlightAltitudeColorsPaint";
import { useMapGeoJsonSync } from "@/hooks/useMapGeoJsonSync";
import { useMapDisplayMode } from "@/hooks/useMapDisplayMode";
import { useMapMoonHorizonDeemphasis } from "@/hooks/useMapMoonHorizonDeemphasis";
import { useMapObserverRadiusSync } from "@/hooks/useMapObserverRadiusSync";
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
import { computeConfirmedTransitFlightIds } from "@/lib/domain/transit/computeConfirmedTransitFlightIds";
import { type FlightFilterCriteria, filterFlightsByCriteria } from "@/lib/flight/flightSearch";
import { ALTITUDE_BANDS } from "@/lib/map/flightAltitudeColor";
import { fieldPerfRecord, isFieldPerfEnabled } from "@/lib/perf/fieldPerf";
import type { IFlightProvider } from "@/types";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import type { CorridorVolumeCustomLayer } from "@/lib/map/CorridorVolumeCustomLayer";
import { Profiler, useEffect, useMemo, useRef, useState } from "react";
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
  const openSkyLatencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const mapDisplayMode = useMoonTransitStore((s) => s.mapDisplayMode);
  const altitudeBandIndex = useMoonTransitStore((s) => s.altitudeBandIndex);

  const filteredFlights = useMemo(() => {
    const byCriteria = filterFlightsByCriteria(flights, flightFilterCriteria);
    if (altitudeBandIndex === 0) return byCriteria;
    const band = ALTITUDE_BANDS[altitudeBandIndex - 1];
    if (!band) return byCriteria;
    return byCriteria.filter((f) => {
      const alt = f.geoAltitudeMeters ?? f.baroAltitudeMeters;
      if (alt == null) return false;
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

  const [mapHeightPx, setMapHeightPx] = useState(0);

  const { moonPathPack, moonAzFeature, intersectionFeatures } =
    useMapMoonOverlayFeatures(
      observer.lat,
      observer.lng,
      referenceEpochMs,
      moon,
      observer.groundHeightMeters,
      mapHeightPx
    );
  const { lineFeature: moonAzNowFeature, labelFeature: moonAzNowLabelFeature } =
    useCurrentMoonAzimuthFeature(observer.lat, observer.lng, observer.groundHeightMeters);

  const corridorVolumeLayerRef = useRef<CorridorVolumeCustomLayer | null>(null);

  const {
    hasMapboxToken,
    elRef,
    mapRef,
    mapReadyTick,
    refreshFlightsNow,
  } = useMoonTransitMap({ flightProvider, isGolden });

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0) setMapHeightPx(Math.round(h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [elRef]);
  const shotFeasibleFlightIds = useMemo(
    () =>
      computeShotFeasibleFlightIds(
        observer,
        moon,
        filteredFlights,
        Date.now(),
        openSkyLatencySkewMs,
        cameraFocalLengthMm,
        cameraSensorType as CameraSensorType
      ),
    [cameraFocalLengthMm, cameraSensorType, filteredFlights, moon, observer, openSkyLatencySkewMs]
  );
  const confirmedTransitFlightIds = useMemo(
    () =>
      computeConfirmedTransitFlightIds(
        observer,
        moon,
        filteredFlights,
        new Date(referenceEpochMs > 0 ? referenceEpochMs : Date.now()),
        Date.now(),
        openSkyLatencySkewMs
      ),
    [filteredFlights, moon, observer, openSkyLatencySkewMs, referenceEpochMs]
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
      moonAzimuthDeg: moon.azimuthDeg,
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

  useEffect(() => {
    if (mapReadyTick === 0) return;
    corridorVolumeLayerRef.current =
      (mapRef.current?.getLayer("corridor-volume-custom") as unknown as CorridorVolumeCustomLayer | undefined) ?? null;
  }, [mapReadyTick, mapRef]);

  useEffect(() => {
    const layer = corridorVolumeLayerRef.current;
    if (!layer) return;
    layer.updateFeatures(selectedFlightId ? [] : transitOpportunityCorridorFeatures);
    mapRef.current?.triggerRepaint();
  }, [transitOpportunityCorridorFeatures, selectedFlightId, mapRef]);

  useMapGeoJsonSync({
    mapRef,
    mapReadyTick,
    moonAzFeature,
    moonAzNowFeature,
    moonAzNowLabelFeature,
    intersectionFeatures,
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
    confirmedTransitFlightIds,
    flightProvider,
  });

  useMapFlightPick(mapRef, mapReadyTick);
  useFlightHistoryLayers(mapRef, mapReadyTick);
  useSelectedFlightTrail(mapRef, mapReadyTick);
  useCallsignHistoryLayer(mapRef, mapReadyTick);

  const moonBelowHorizon = !isMoonVisibleFromMoonState(moon);
  useMapMoonHorizonDeemphasis(mapRef, mapReadyTick, moonBelowHorizon);
  useMapObserverRadiusSync(mapRef, mapReadyTick, observer.lat, observer.lng);

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
      <div className="pointer-events-none md:contents max-md:fixed max-md:bottom-[var(--mobile-overlay-bottom)] max-md:left-3 max-md:right-3 max-md:z-[76] max-md:flex max-md:items-stretch max-md:gap-2">
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