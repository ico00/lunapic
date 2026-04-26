import type { Map } from "mapbox-gl";
import {
  FLIGHT_PLANE_ICON_IMAGE_ID,
  FLIGHT_PLANE_ICON_SIZE,
  FLIGHT_PLANE_ICON_URL,
  SELECTED_STAND_MAP_FILL_OPACITY,
  SELECTED_STAND_MAP_LINE_OPACITY,
  SELECTED_STAND_SPINE_LINE_OPACITY,
  SELECTED_STAND_SPINE_LINE_WIDTH,
} from "@/lib/map/mapOverlayConstants";
import {
  FLIGHTS_LAYER_ID,
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

const MOON_INT_LAYER_ID = "moon-intersections";

function addFlightsCircleFallback(map: Map): void {
  if (map.getLayer(FLIGHTS_LAYER_ID)) {
    return;
  }
  map.addLayer({
    id: FLIGHTS_LAYER_ID,
    type: "circle",
    source: FLIGHTS_SOURCE,
    paint: {
      "circle-radius": 6,
      "circle-color": "#38bdf8",
      "circle-stroke-color": "#0f172a",
      "circle-stroke-width": 1,
    },
  });
}

function addFlightsPlaneSymbolLayer(map: Map): void {
  if (map.getLayer(FLIGHTS_LAYER_ID)) {
    return;
  }
  /**
   * Bez `beforeId` — na vrh trenutnog stila, iznad naših mjesečinih / trak overlaya
   * (s `beforeId: moon-int` kružnice i cijan traka prekriju zrakoplove).
   */
  map.addLayer({
    id: FLIGHTS_LAYER_ID,
    type: "symbol",
    source: FLIGHTS_SOURCE,
    layout: {
      "icon-image": FLIGHT_PLANE_ICON_IMAGE_ID,
      "icon-size": FLIGHT_PLANE_ICON_SIZE,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-rotate": ["coalesce", ["to-number", ["get", "track"]], 0],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
    },
  });
}

/**
 * Pokuša zamijeniti kružni fallback simbolom s ikonom (ili ostaviti kružni ako ne uspije).
 * Sloj s `FLIGHTS_SOURCE` MORA već postojati (vidi kraj `registerMoonTransitLayers`).
 */
function scheduleFlightLayerWithPlaneIcon(map: Map): void {
  const url =
    typeof window !== "undefined"
      ? new URL(FLIGHT_PLANE_ICON_URL, window.location.origin).href
      : FLIGHT_PLANE_ICON_URL;

  /**
   * Mapbox `loadImage` na SVG + kratki `setTimeout` fallback ranije su stvarali
   * plavi krug prije nego SVG stigne; kasniji uspjeh nije zamijenio sloj.
   * `Image` + `addImage(HTMLImageElement)` pouzdanije za isti SVG.
   */
  const img = new Image();
  const runUpgrade = () => {
    if (!map.isStyleLoaded()) {
      return;
    }
    try {
      if (!map.hasImage(FLIGHT_PLANE_ICON_IMAGE_ID)) {
        map.addImage(FLIGHT_PLANE_ICON_IMAGE_ID, img);
      }
      const existing = map.getLayer(FLIGHTS_LAYER_ID) as
        | { type?: string }
        | undefined;
      if (existing?.type === "circle") {
        map.removeLayer(FLIGHTS_LAYER_ID);
      }
      if (!map.getLayer(FLIGHTS_LAYER_ID)) {
        addFlightsPlaneSymbolLayer(map);
      }
    } catch {
      if (!map.getLayer(FLIGHTS_LAYER_ID)) {
        addFlightsCircleFallback(map);
      }
    }
    if (map.getLayer(FLIGHTS_LAYER_ID)) {
      map.moveLayer(FLIGHTS_LAYER_ID);
    }
  };

  const scheduleWhenStyleReady = (fn: () => void) => {
    if (map.isStyleLoaded()) {
      fn();
    } else {
      map.once("idle", () => {
        if (map.isStyleLoaded()) {
          fn();
        }
      });
    }
  };

  img.onload = () => {
    scheduleWhenStyleReady(() => {
      runUpgrade();
    });
  };
  img.onerror = () => {
    scheduleWhenStyleReady(() => {
      if (!map.getLayer(FLIGHTS_LAYER_ID)) {
        addFlightsCircleFallback(map);
      }
      if (map.getLayer(FLIGHTS_LAYER_ID)) {
        map.moveLayer(FLIGHTS_LAYER_ID);
      }
    });
  };
  img.src = url;
}

/**
 * Registrira sve GeoJSON izvore i stilove slojeva za Moon Transit (pozvati nakon
 * `map` događaja "load" / kad je stil spreman).
 *
 * * Simbol: asinkrano u `scheduleFlightLayerWithPlaneIcon` (nakon učitavanja SVG);
 *   dok se ne učita, vidljiv je kružni fallback na istom izvoru.
 * * `onLayersReady` odmah nakon dodanog kružnog sloja (mapa, izvor `flights-geo` i
 *   `setData` mogu ući u sink pri prvom povećanju `mapReadyTick` — async ikona
 *   samo nadograđuje prikaz).
 */
export function registerMoonTransitLayers(
  map: Map,
  onLayersReady?: () => void
): void {
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

  map.addSource(SELECTED_STAND_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addSource(SELECTED_STAND_SPINE_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
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

  map.addSource(MOON_INT_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: MOON_INT_LAYER_ID,
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

  map.addLayer({
    id: "selected-aircraft-stand-fill",
    type: "fill",
    source: SELECTED_STAND_SOURCE,
    paint: {
      "fill-color": "#38bdf8",
      "fill-opacity": SELECTED_STAND_MAP_FILL_OPACITY,
    },
  });
  map.addLayer({
    id: "selected-aircraft-stand-outline",
    type: "line",
    source: SELECTED_STAND_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#38bdf8",
      "line-width": 2,
      "line-opacity": SELECTED_STAND_MAP_LINE_OPACITY,
    },
  });
  map.addLayer({
    id: "selected-stand-spine-backing",
    type: "line",
    source: SELECTED_STAND_SPINE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#0b1220",
      "line-width": SELECTED_STAND_SPINE_LINE_WIDTH + 3.2,
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "selected-stand-spine",
    type: "line",
    source: SELECTED_STAND_SPINE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#fffcf0",
      "line-width": SELECTED_STAND_SPINE_LINE_WIDTH,
      "line-opacity": SELECTED_STAND_SPINE_LINE_OPACITY,
    },
  });

  addFlightsCircleFallback(map);
  if (map.getLayer(FLIGHTS_LAYER_ID)) {
    map.moveLayer(FLIGHTS_LAYER_ID);
  }
  scheduleFlightLayerWithPlaneIcon(map);
  onLayersReady?.();
}
