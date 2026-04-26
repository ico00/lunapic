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
  SELECTED_STAND_SPINE_SOURCE,
  SELECTED_STAND_SOURCE,
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
  /** Kad je postavljen, na karti se crta samo taj zrakoplov (ostali ADS-B markeri skriveni). */
  selectedFlightId: string | null;
  /** Poligoni trake (jedan, T=0) uz odabran zrakoplov. */
  standCorridorFeatures: readonly Feature[];
  /** Središnja nulta-linija trake (3D LoS). */
  standSpineFeature: Feature | null;
  flightProvider: IFlightProvider;
};
export function useMapGeoJsonSync(a: UseMapGeoJsonSyncArgs): void {
  const {
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
    fieldPerfTime("geojson:standCorridor", () => {
      const map = mapRef.current;
      const src = map?.getSource(SELECTED_STAND_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!src) {
        return;
      }
      src.setData({
        type: "FeatureCollection",
        features: [...standCorridorFeatures],
      });
    });
  }, [standCorridorFeatures, mapReadyTick, mapRef]);

  useEffect(() => {
    fieldPerfTime("geojson:standSpine", () => {
      const map = mapRef.current;
      const s = map?.getSource(SELECTED_STAND_SPINE_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!s) {
        return;
      }
      s.setData({
        type: "FeatureCollection",
        features: standSpineFeature ? [standSpineFeature] : [],
      });
    });
  }, [standSpineFeature, mapReadyTick, mapRef]);

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
    const idForFilter =
      selectedFlightId == null
        ? null
        : flights.some((f) => f.id === selectedFlightId)
          ? selectedFlightId
          : null;
    const visibleFlights =
      idForFilter == null
        ? flights
        : flights.filter((f) => f.id === idForFilter);
    src.setData({
      type: "FeatureCollection",
      features: visibleFlights.map((f) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [f.position.lng, f.position.lat],
        },
        properties: {
          id: f.id,
          name: f.callSign ?? f.id,
          track:
            typeof f.trackDeg === "number" && Number.isFinite(f.trackDeg)
              ? ((f.trackDeg % 360) + 360) % 360
              : 0,
        },
      })),
    });
    });
  }, [flights, mapRef, mapReadyTick, selectedFlightId]);

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
