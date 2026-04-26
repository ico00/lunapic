import type { Map } from "mapbox-gl";
import {
  FLIGHTS_SOURCE,
  GROUND_OPTIMAL_SOURCE,
  MOON_AZ_SOURCE,
  MOON_INT_SOURCE,
  MOON_PATH_LABELS_SOURCE,
  MOON_PATH_SOURCE,
  ROUTES_SOURCE,
} from "@/lib/map/mapSourceIds";

/**
 * Registrira sve GeoJSON izvore i stilove slojeva za Moon Transit (pozvati nakon
 * `map` događaja "load" / kad je stil spreman).
 */
export function registerMoonTransitLayers(map: Map): void {
  map.addSource(ROUTES_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "routes-line",
    type: "line",
    source: ROUTES_SOURCE,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#a78bfa",
      "line-width": 2.5,
      "line-opacity": 0.4,
    },
  });
  map.addSource(GROUND_OPTIMAL_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "optimal-ground-line",
    type: "line",
    source: GROUND_OPTIMAL_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#c4b5fd",
      "line-width": 1.1,
      "line-opacity": 0.4,
      "line-dasharray": [1.1, 1.3],
    },
  });

  map.addSource(MOON_PATH_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addSource(MOON_AZ_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "moon-az-glow",
    type: "line",
    source: MOON_AZ_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#fef08a",
      "line-width": 10,
      "line-blur": 3.5,
      "line-opacity": 0.24,
    },
  });
  map.addLayer({
    id: "moon-az-core",
    type: "line",
    source: MOON_AZ_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#fffbeb",
      "line-width": 1.4,
      "line-opacity": 0.95,
    },
  });

  map.addSource(MOON_PATH_LABELS_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addSource(FLIGHTS_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "flights-layer",
    type: "circle",
    source: FLIGHTS_SOURCE,
    paint: {
      "circle-radius": 6,
      "circle-color": "#38bdf8",
      "circle-stroke-color": "#0f172a",
      "circle-stroke-width": 1,
    },
  });

  map.addSource(MOON_INT_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "moon-intersections",
    type: "circle",
    source: MOON_INT_SOURCE,
    paint: {
      "circle-radius": 6,
      "circle-color": "#facc15",
      "circle-stroke-color": "#1c1917",
      "circle-stroke-width": 2,
      "circle-opacity": 0.95,
    },
  });

  map.addLayer({
    id: "moon-path-line",
    type: "line",
    source: MOON_PATH_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": 2.5,
      "line-opacity": 0.9,
      "line-dasharray": [1.2, 1.8],
    },
  });
  map.addLayer({
    id: "moon-path-labels",
    type: "symbol",
    source: MOON_PATH_LABELS_SOURCE,
    layout: {
      "text-field": ["get", "label"],
      "text-size": 15,
      "text-font": [
        "Open Sans Semibold",
        "Arial Unicode MS Bold",
      ],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#fbbf24",
      "text-halo-color": "#18181b",
      "text-halo-width": 1.1,
    },
  });
}
