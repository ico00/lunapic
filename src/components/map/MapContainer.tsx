"use client";

import { SelectedAircraftMapPopup } from "@/components/map/SelectedAircraftMapPopup";
import { FieldPerfOverlay } from "@/components/perf/FieldPerfOverlay";
import { useExtrapolatedFlightsForMap } from "@/hooks/useExtrapolatedFlightsForMap";
import { useMapFlightPick } from "@/hooks/useMapFlightPick";
import { useMapGeoJsonSync } from "@/hooks/useMapGeoJsonSync";
import { useMapMoonHorizonDeemphasis } from "@/hooks/useMapMoonHorizonDeemphasis";
import { useMapMoonOverlayFeatures } from "@/hooks/useMapMoonOverlayFeatures";
import { useMoonTransitMap } from "@/hooks/useMoonTransitMap";
import { useSelectedAircraftStandCorridorFeatures } from "@/hooks/useSelectedAircraftStandCorridorFeatures";
import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import { isMoonVisibleFromMoonState } from "@/lib/domain/astro/moonVisibility";
import { fieldPerfRecord, isFieldPerfEnabled } from "@/lib/perf/fieldPerf";
import type { IFlightProvider } from "@/types";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { Profiler } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapContainerProps = {
  flightProvider: IFlightProvider;
  /** Žuta = plava u okviru 0,1° — nisan na markeru, bljesak u roditelju. */
  isGolden?: boolean;
};

export function MapContainer({ flightProvider, isGolden = false }: MapContainerProps) {
  const flights = useExtrapolatedFlightsForMap();
  const observer = useObserverStore((s) => s.observer);
  const moon = useMoonStateComputed();
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);

  const { moonPathPack, moonAzFeature, intersectionFeatures, optimalGroundFeatures } =
    useMapMoonOverlayFeatures(
      observer.lat,
      observer.lng,
      referenceEpochMs,
      moon
    );

  const {
    hasMapboxToken,
    elRef,
    mapRef,
    mapReadyTick,
  } = useMoonTransitMap({ flightProvider, isGolden });

  const { fillFeatures: standCorridorFeatures, spineFeature: standSpineFeature } =
    useSelectedAircraftStandCorridorFeatures({
      selectedFlightId,
      extrapolatedFlights: flights,
      observer,
    });

  useMapGeoJsonSync({
    mapRef,
    mapReadyTick,
    moonAzFeature,
    intersectionFeatures,
    optimalGroundFeatures,
    moonPathPack,
    flights,
    selectedFlightId,
    standCorridorFeatures,
    standSpineFeature,
    flightProvider,
  });

  useMapFlightPick(mapRef, mapReadyTick);

  const moonBelowHorizon = !isMoonVisibleFromMoonState(moon);
  useMapMoonHorizonDeemphasis(mapRef, mapReadyTick, moonBelowHorizon);

  if (!hasMapboxToken) {
    return (
      <div
        data-testid="map-missing-token"
        className="flex h-full items-center justify-center bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 px-4 text-center text-sm text-amber-200/95 ring-1 ring-inset ring-amber-500/10"
      >
        Set <code className="mx-1 rounded bg-zinc-800 px-1.5 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> in
        .env.local
      </div>
    );
  }

  const mapColumn = (
    <div className="relative h-full w-full" data-testid="map-surface">
      <div ref={elRef} className="h-full w-full" />
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