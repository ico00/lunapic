import type { MoonPathPack } from "@/hooks/useMapMoonOverlayFeatures";
import { geoBoundsFromMapbox } from "@/lib/map/geoBoundsFromMapbox";
import {
  FLIGHTS_SOURCE,
  GROUND_OPTIMAL_SOURCE,
  MOON_AZ_SOURCE,
  MOON_AZ_NOW_SOURCE,
  MOON_AZ_NOW_LABEL_SOURCE,
  MOON_INT_SOURCE,
  MOON_PATH_LABELS_SOURCE,
  MOON_PATH_SOURCE,
  MOON_PATH_FULL_DAY_SOURCE,
  MOON_PATH_CURRENT_SOURCE,
  ROUTES_SOURCE,
  SELECTED_FLIGHT_TRAJECTORY_LABEL_SOURCE,
  SELECTED_FLIGHT_TRAJECTORY_SOURCE,
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
  moonAzNowFeature: Feature;
  moonAzNowLabelFeature: Feature;
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
  /** Kratkoročna predikcija putanje za odabrani avion. */
  selectedFlightTrajectoryFeature: Feature | null;
  /** Label (npr. +90s) na vrhu predikcije putanje. */
  selectedFlightTrajectoryLabelFeature: Feature | null;
  flightProvider: IFlightProvider;
};
export function useMapGeoJsonSync(a: UseMapGeoJsonSyncArgs): void {
  const {
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
    standCorridorFeatures,
    standSpineFeature,
    selectedFlightTrajectoryFeature,
    selectedFlightTrajectoryLabelFeature,
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
    const moonNowSrc = map.getSource(MOON_AZ_NOW_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    moonNowSrc?.setData(moonAzNowFeature);
    const moonNowLabelSrc = map.getSource(MOON_AZ_NOW_LABEL_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    moonNowLabelSrc?.setData(moonAzNowLabelFeature);
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
    moonAzNowFeature,
    moonAzNowLabelFeature,
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
    fieldPerfTime("geojson:selectedTrajectory", () => {
      const map = mapRef.current;
      const s = map?.getSource(SELECTED_FLIGHT_TRAJECTORY_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!s) {
        return;
      }
      s.setData({
        type: "FeatureCollection",
        features: selectedFlightTrajectoryFeature
          ? [selectedFlightTrajectoryFeature]
          : [],
      });
    });
  }, [selectedFlightTrajectoryFeature, mapReadyTick, mapRef]);

  useEffect(() => {
    fieldPerfTime("geojson:selectedTrajectoryLabel", () => {
      const map = mapRef.current;
      const s = map?.getSource(SELECTED_FLIGHT_TRAJECTORY_LABEL_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!s) {
        return;
      }
      s.setData({
        type: "FeatureCollection",
        features: selectedFlightTrajectoryLabelFeature
          ? [selectedFlightTrajectoryLabelFeature]
          : [],
      });
    });
  }, [selectedFlightTrajectoryLabelFeature, mapReadyTick, mapRef]);

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
    const moonPathFullDaySource = map.getSource(MOON_PATH_FULL_DAY_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    moonPathFullDaySource?.setData({
      type: "FeatureCollection",
      features: moonPathPack.fullDayLineFeature
        ? [moonPathPack.fullDayLineFeature]
        : [],
    });
    (map.getSource(MOON_PATH_LABELS_SOURCE) as mapboxgl.GeoJSONSource).setData(
      {
        type: "FeatureCollection",
        features: moonPathPack.labelFeatures,
      }
    );
    const moonPathCurrentSource = map.getSource(MOON_PATH_CURRENT_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    moonPathCurrentSource?.setData({
      type: "FeatureCollection",
      features: [moonPathPack.currentPointFeature],
    });
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
