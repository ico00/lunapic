"use client";

import { MapObserverControlStrip } from "@/components/map/MapObserverControlStrip";
import { FieldPerfOverlay } from "@/components/perf/FieldPerfOverlay";
import { WeatherOverlay } from "@/components/weather/WeatherOverlay";
import { useExtrapolatedFlightsForMap } from "@/hooks/useExtrapolatedFlightsForMap";
import { useMapGeoJsonSync } from "@/hooks/useMapGeoJsonSync";
import { useMapMoonOverlayFeatures } from "@/hooks/useMapMoonOverlayFeatures";
import { useMoonTransitMap } from "@/hooks/useMoonTransitMap";
import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import { useWeatherSync } from "@/hooks/useWeatherSync";
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
  useWeatherSync();

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
    placeObserverHere,
    focusMapOnObserver,
  } = useMoonTransitMap({ flightProvider, isGolden });

  const observerLocationLocked = useObserverStore(
    (s) => s.observerLocationLocked
  );

  useMapGeoJsonSync({
    mapRef,
    mapReadyTick,
    moonAzFeature,
    intersectionFeatures,
    optimalGroundFeatures,
    moonPathPack,
    flights,
    flightProvider,
  });

  if (!hasMapboxToken) {
    return (
      <div
        data-testid="map-missing-token"
        className="flex h-full items-center justify-center bg-zinc-900 px-4 text-center text-sm text-amber-200"
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
      <WeatherOverlay />
      <MapObserverControlStrip
        observerLocationLocked={observerLocationLocked}
        onSetLocationHere={placeObserverHere}
        onFocusMapOnObserver={focusMapOnObserver}
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