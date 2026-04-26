import type { MoonPathPack } from "@/hooks/useMapMoonOverlayFeatures";
import { geoBoundsFromMapbox } from "@/lib/map/geoBoundsFromMapbox";
import {
  FLIGHTS_SOURCE,
  GROUND_OPTIMAL_SOURCE,
  MOON_AZ_SOURCE,
  MOON_INT_SOURCE,
  MOON_PATH_LABELS_SOURCE,
  MOON_PATH_SOURCE,
  ROUTES_SOURCE,
} from "@/lib/map/mapSourceIds";
import type { IFlightProvider } from "@/types";
import type { FlightState } from "@/types/flight";
import type mapboxgl from "mapbox-gl";
import type { Feature } from "geojson";
import { fieldPerfTime } from "@/lib/perf/fieldPerf";
import { useEffect, type RefObject } from "react";

type UseMapGeoJsonSyncArgs = {
  mapRef: RefObject<mapboxgl.Map | null>;
  mapReadyTick: number;
  moonAzFeature: Feature;
  intersectionFeatures: readonly Feature[];
  optimalGroundFeatures: readonly Feature[];
  moonPathPack: MoonPathPack;
  flights: readonly FlightState[];
  flightProvider: IFlightProvider;
};

/**
 * Push GeoJSON u Mapbox izvore kad se promijene podaci ili se karta tek učitala
 * (`mapReadyTick` nakon `registerMoonTransitLayers`).
 */
export function useMapGeoJsonSync(a: UseMapGeoJsonSyncArgs): void {
  const {
    mapRef,
    mapReadyTick,
    moonAzFeature,
    intersectionFeatures,
    optimalGroundFeatures,
    moonPathPack,
    flights,
    flightProvider,
  } = a;

  useEffect(() => {
    fieldPerfTime("geojson:moonLayers", () => {
    const map = mapRef.current;
    if (!map?.getSource(MOON_AZ_SOURCE)) {
      return;
    }
    (map.getSource(MOON_AZ_SOURCE) as mapboxgl.GeoJSONSource).setData(
      moonAzFeature
    );
    (map.getSource(MOON_INT_SOURCE) as mapboxgl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [...intersectionFeatures],
    });
    const og = map.getSource(GROUND_OPTIMAL_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (og) {
      og.setData({
        type: "FeatureCollection",
        features: [...optimalGroundFeatures],
      });
    }
    });
  }, [
    intersectionFeatures,
    moonAzFeature,
    optimalGroundFeatures,
    mapReadyTick,
    mapRef,
  ]);

  useEffect(() => {
    fieldPerfTime("geojson:moonPath", () => {
    const map = mapRef.current;
    if (!map?.getSource(MOON_PATH_SOURCE)) {
      return;
    }
    (map.getSource(MOON_PATH_SOURCE) as mapboxgl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: moonPathPack.lineFeature ? [moonPathPack.lineFeature] : [],
    });
    (map.getSource(MOON_PATH_LABELS_SOURCE) as mapboxgl.GeoJSONSource).setData(
      {
        type: "FeatureCollection",
        features: moonPathPack.labelFeatures,
      }
    );
    });
  }, [moonPathPack, mapReadyTick, mapRef]);

  useEffect(() => {
    fieldPerfTime("geojson:flights", () => {
    const map = mapRef.current;
    if (!map || !map.getSource(FLIGHTS_SOURCE)) {
      return;
    }
    const src = map.getSource(FLIGHTS_SOURCE) as mapboxgl.GeoJSONSource;
    src.setData({
      type: "FeatureCollection",
      features: flights.map((f) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [f.position.lng, f.position.lat],
        },
        properties: { id: f.id, name: f.callSign ?? f.id },
      })),
    });
    });
  }, [flights, mapRef, mapReadyTick]);

  useEffect(() => {
    fieldPerfTime("geojson:routes", () => {
    const map = mapRef.current;
    if (!map || !map.getSource(ROUTES_SOURCE)) {
      return;
    }
    const b = map.getBounds();
    if (!b) {
      return;
    }
    const bounds = geoBoundsFromMapbox(b);
    const routeSrc = map.getSource(ROUTES_SOURCE) as mapboxgl.GeoJSONSource;
    const lines = flightProvider.getRouteLineFeatures?.(bounds) ?? [];
    routeSrc.setData({
      type: "FeatureCollection",
      features: [...lines],
    });
    });
  }, [flightProvider, mapRef, mapReadyTick]);
}
