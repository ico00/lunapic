import type { AnyLayer, Map } from "mapbox-gl";
import { flightFeatureColorMapboxExpressionForAltitudeTint } from "@/lib/map/flightAltitudeColor";
import {
  FLIGHT_3D_MODEL_ID,
  FLIGHT_3D_MODEL_URL,
  SELECTED_STAND_MAP_FILL_OPACITY,
  SELECTED_STAND_MAP_LINE_OPACITY,
  SELECTED_STAND_SPINE_LINE_OPACITY,
  SELECTED_STAND_SPINE_LINE_WIDTH,
} from "@/lib/map/mapOverlayConstants";
import { ensureMapboxTerrain } from "@/lib/map/mapboxTerrainElevation";
import {
  FLIGHTS_LAYER_ID,
  FLIGHTS_ATC_LEADER_SOURCE,
  FLIGHTS_ATC_LABEL_SOURCE,
  FLIGHTS_ATC_PREDICTION_SOURCE,
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
  SELECTED_STAND_SPINE_SOURCE,
  SELECTED_STAND_SOURCE,
  SELECTED_FLIGHT_TRAJECTORY_SOURCE,
} from "@/lib/map/mapSourceIds";

const MOON_INT_LAYER_ID = "moon-intersections";
const FLIGHTS_SHADOW_LAYER_ID = "flights-shadow-layer";
export const ATC_FLIGHTS_DOT_LAYER_ID = "atc-flights-dot-layer";
export const ATC_FLIGHTS_LABEL_LAYER_ID = "atc-flights-label-layer";
export const ATC_FLIGHTS_LEADER_LAYER_ID = "atc-flights-leader-layer";
export const ATC_FLIGHTS_PREDICTION_LAYER_ID = "atc-flights-prediction-layer";
const FLIGHT_MODEL_SCREEN_SIZE_REFERENCE_ZOOM = 11;
const FLIGHT_MODEL_SCREEN_SIZE_MIN_FACTOR = 1.4;
const FLIGHT_MODEL_SCREEN_SIZE_MAX_FACTOR = 260;
const FLIGHT_MODEL_YAW_OFFSET_DEG = 90;

function buildFlightModelScaleByAltitudeExpression(zoom: number): unknown[] {
  // Compensate world-space model size so aircraft keep near-constant on-screen size.
  const rawFactor = Math.pow(2, FLIGHT_MODEL_SCREEN_SIZE_REFERENCE_ZOOM - zoom);
  const factor = Math.min(
    FLIGHT_MODEL_SCREEN_SIZE_MAX_FACTOR,
    Math.max(FLIGHT_MODEL_SCREEN_SIZE_MIN_FACTOR, rawFactor)
  );
  // Lower altitude = larger apparent size (closer to camera), higher = smaller.
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["to-number", ["get", "altitudeMeters"]], 8000],
    1500,
    ["literal", [28 * factor, 28 * factor, 28 * factor]],
    6000,
    ["literal", [20 * factor, 20 * factor, 20 * factor]],
    12000,
    ["literal", [14 * factor, 14 * factor, 14 * factor]],
  ];
}

function applyFlightModelZoomScaleCompensation(map: Map): void {
  const layer = map.getLayer(FLIGHTS_LAYER_ID) as { type?: string } | undefined;
  if (layer?.type !== "model") {
    return;
  }
  map.setPaintProperty(
    FLIGHTS_LAYER_ID,
    "model-scale",
    buildFlightModelScaleByAltitudeExpression(map.getZoom()) as never
  );
}

type FlightModelZoomRegistry = {
  __lunapicFlightModelZoomHook?: boolean;
  /** Coalesces `setPaintProperty` during pinch/double-tap zoom (was every raw `zoom` event). */
  __lunapicFlightModelZoomRaf?: number | null;
};

function scheduleFlightModelZoomPaint(map: Map): void {
  const registry = map as unknown as FlightModelZoomRegistry;
  if (registry.__lunapicFlightModelZoomRaf != null) {
    return;
  }
  registry.__lunapicFlightModelZoomRaf = requestAnimationFrame(() => {
    registry.__lunapicFlightModelZoomRaf = null;
    applyFlightModelZoomScaleCompensation(map);
  });
}

function ensureFlightModelZoomScaleCompensation(map: Map): void {
  const registry = map as unknown as FlightModelZoomRegistry;
  if (registry.__lunapicFlightModelZoomHook) {
    applyFlightModelZoomScaleCompensation(map);
    return;
  }
  registry.__lunapicFlightModelZoomHook = true;
  map.on("zoom", () => {
    scheduleFlightModelZoomPaint(map);
  });
  map.on("zoomend", () => {
    if (registry.__lunapicFlightModelZoomRaf != null) {
      cancelAnimationFrame(registry.__lunapicFlightModelZoomRaf);
      registry.__lunapicFlightModelZoomRaf = null;
    }
    applyFlightModelZoomScaleCompensation(map);
  });
  applyFlightModelZoomScaleCompensation(map);
}

function addFlightsShadowLayer(map: Map): void {
  if (map.getLayer(FLIGHTS_SHADOW_LAYER_ID)) {
    return;
  }
  map.addLayer({
    id: FLIGHTS_SHADOW_LAYER_ID,
    type: "circle",
    source: FLIGHTS_SOURCE,
    paint: {
      "circle-radius": 4.5,
      "circle-color": "#000000",
      "circle-opacity": 0.32,
      "circle-blur": 0.6,
      "circle-stroke-width": 0,
    },
  });
}

function addFlightsCircleFallback(map: Map): void {
  addFlightsShadowLayer(map);
  if (map.getLayer(FLIGHTS_LAYER_ID)) {
    return;
  }
  map.addLayer({
    id: FLIGHTS_LAYER_ID,
    type: "circle",
    source: FLIGHTS_SOURCE,
    paint: {
      "circle-radius": 6,
      "circle-color": flightFeatureColorMapboxExpressionForAltitudeTint(
        true
      ) as never,
      "circle-stroke-color": "#0f172a",
      "circle-stroke-width": 1,
    },
  });
}

function addAtcFlightsLayers(map: Map): void {
  if (!map.getSource(FLIGHTS_ATC_PREDICTION_SOURCE)) {
    map.addSource(FLIGHTS_ATC_PREDICTION_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(ATC_FLIGHTS_PREDICTION_LAYER_ID)) {
    map.addLayer({
      id: ATC_FLIGHTS_PREDICTION_LAYER_ID,
      type: "line",
      source: FLIGHTS_ATC_PREDICTION_SOURCE,
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#67e8f9",
        "line-width": 1.6,
        "line-opacity": 0.9,
      },
    });
  }
  if (!map.getSource(FLIGHTS_ATC_LEADER_SOURCE)) {
    map.addSource(FLIGHTS_ATC_LEADER_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getSource(FLIGHTS_ATC_LABEL_SOURCE)) {
    map.addSource(FLIGHTS_ATC_LABEL_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(ATC_FLIGHTS_LEADER_LAYER_ID)) {
    map.addLayer({
      id: ATC_FLIGHTS_LEADER_LAYER_ID,
      type: "line",
      source: FLIGHTS_ATC_LEADER_SOURCE,
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#bfdbfe",
        "line-width": 1.1,
        "line-opacity": 0.9,
      },
    });
  }
  if (!map.getLayer(ATC_FLIGHTS_DOT_LAYER_ID)) {
    map.addLayer({
      id: ATC_FLIGHTS_DOT_LAYER_ID,
      type: "circle",
      source: FLIGHTS_SOURCE,
      layout: {
        visibility: "none",
      },
      paint: {
        "circle-radius": 9,
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-stroke-color": "#e0f2fe",
        "circle-stroke-width": 2.4,
        "circle-opacity": 0.98,
      },
    });
  }
  if (!map.getLayer(ATC_FLIGHTS_LABEL_LAYER_ID)) {
    map.addLayer({
      id: ATC_FLIGHTS_LABEL_LAYER_ID,
      type: "symbol",
      source: FLIGHTS_ATC_LABEL_SOURCE,
      layout: {
        visibility: "none",
        "text-field": [
          "format",
          ["coalesce", ["get", "atcCallsign"], ["get", "name"]],
          { "font-scale": 1.18 },
          "\n",
          {},
          ["coalesce", ["get", "atcLineFl"], ""],
          { "font-scale": 1.02 },
          "\n",
          {},
          ["coalesce", ["get", "atcLineSpd"], ""],
          { "font-scale": 1.02 },
          "\n",
          {},
          ["coalesce", ["get", "atcLineHdg"], ""],
          { "font-scale": 1.02 },
        ],
        "text-size": 13,
        "text-font": [
          "JetBrains Mono Bold",
          "JetBrains Mono Regular",
          "DIN Offc Pro Bold",
          "Arial Unicode MS Bold",
        ],
        "text-anchor": "left",
        "text-justify": "left",
        "text-offset": [0.15, -0.05],
        "text-letter-spacing": 0.04,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#e0e7ff",
        "text-halo-color": "#1e1b4b",
        "text-halo-width": 1.2,
        "text-opacity": 0.95,
      },
    });
  }
}

function addFlightsModelLayer(map: Map): void {
  addFlightsShadowLayer(map);
  if (map.getLayer(FLIGHTS_LAYER_ID)) {
    return;
  }
  if (!map.hasModel(FLIGHT_3D_MODEL_ID)) {
    map.addModel(FLIGHT_3D_MODEL_ID, FLIGHT_3D_MODEL_URL);
  }
  /**
   * 3D instanca po značajki: rotacija kao ADS-B `track`, pomak Z = nadmorska visina rute,
   * skala ovisno o `altitudeMeters` (bez zoom izraza — ograničenje GeoJSON model sloja).
   */
  map.addLayer({
    id: FLIGHTS_LAYER_ID,
    type: "model",
    source: FLIGHTS_SOURCE,
    layout: {
      "model-id": FLIGHT_3D_MODEL_ID,
    },
    paint: {
      "model-type": "common-3d",
      "model-scale": buildFlightModelScaleByAltitudeExpression(map.getZoom()),
      "model-translation": [
        0,
        0,
        [
          "*",
          ["coalesce", ["to-number", ["get", "altitudeMeters"]], 0],
          0.08,
        ],
      ],
      "model-rotation": [
        0,
        0,
        [
          "%",
          [
            "+",
            ["coalesce", ["to-number", ["get", "track"]], 0],
            FLIGHT_MODEL_YAW_OFFSET_DEG,
            360,
          ],
          360,
        ],
      ],
      "model-color": flightFeatureColorMapboxExpressionForAltitudeTint(
        true
      ) as never,
      "model-color-mix-intensity": 0.55,
    },
  } as unknown as AnyLayer);
  ensureFlightModelZoomScaleCompensation(map);
}

/**
 * Učitava glTF i zamjenjuje kružni fallback model slojem (ili ostavlja krug ako API baci).
 */
export function ensureFlightLayerWith3dModel(map: Map): void {
  const finishStacking = () => {
    if (map.getLayer(FLIGHTS_LAYER_ID)) {
      map.moveLayer(FLIGHTS_LAYER_ID);
    }
    if (map.getLayer(FLIGHTS_SHADOW_LAYER_ID) && map.getLayer(FLIGHTS_LAYER_ID)) {
      map.moveLayer(FLIGHTS_SHADOW_LAYER_ID, FLIGHTS_LAYER_ID);
    }
  };

  const runUpgrade = () => {
    if (!map.isStyleLoaded()) {
      return;
    }
    try {
      if (!map.hasModel(FLIGHT_3D_MODEL_ID)) {
        map.addModel(FLIGHT_3D_MODEL_ID, FLIGHT_3D_MODEL_URL);
      }
      const existing = map.getLayer(FLIGHTS_LAYER_ID) as
        | { type?: string }
        | undefined;
      if (existing?.type === "circle" || existing?.type === "symbol") {
        map.removeLayer(FLIGHTS_LAYER_ID);
      }
      if (!map.getLayer(FLIGHTS_LAYER_ID)) {
        addFlightsModelLayer(map);
      }
    } catch {
      if (!map.getLayer(FLIGHTS_LAYER_ID)) {
        addFlightsCircleFallback(map);
      }
    }
    finishStacking();
  };

  if (map.isStyleLoaded()) {
    runUpgrade();
  } else {
    map.once("idle", () => {
      if (map.isStyleLoaded()) {
        runUpgrade();
      }
    });
  }
}

/**
 * Registrira sve GeoJSON izvore i stilove slojeva za LunaPic (pozvati nakon
 * `map` događaja "load" / kad je stil spreman).
 *
 * * 3D model: u `scheduleFlightLayerWith3dModel` (`addModel` + sloj `type: model`);
 *   dok se ne primijeni, vidljiv je kružni fallback na istom izvoru.
 * * `onLayersReady` odmah nakon dodanog kružnog sloja (mapa, izvor `flights-geo` i
 *   `setData` mogu ući u sink pri prvom povećanju `mapReadyTick` — async ikona
 *   samo nadograđuje prikaz).
 */
export function registerMoonTransitLayers(
  map: Map,
  onLayersReady?: () => void
): void {
  ensureMapboxTerrain(map);
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
  map.addSource(SELECTED_FLIGHT_TRAJECTORY_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addSource(SELECTED_FLIGHT_TRAJECTORY_LABEL_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addSource(MOON_PATH_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addSource(MOON_PATH_FULL_DAY_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addSource(MOON_PATH_CURRENT_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addSource(MOON_AZ_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addSource(MOON_AZ_NOW_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addSource(MOON_AZ_NOW_LABEL_SOURCE, {
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
  map.addLayer({
    id: "moon-az-now-glow",
    type: "line",
    source: MOON_AZ_NOW_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#22d3ee",
      "line-width": 7.5,
      "line-blur": 2.8,
      "line-opacity": 0.24,
    },
  });
  map.addLayer({
    id: "moon-az-now-core",
    type: "line",
    source: MOON_AZ_NOW_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#67e8f9",
      "line-width": 1.5,
      "line-opacity": 0.95,
      "line-dasharray": [0.9, 1.2],
    },
  });
  map.addLayer({
    id: "moon-az-now-label",
    type: "symbol",
    source: MOON_AZ_NOW_LABEL_SOURCE,
    layout: {
      "text-field": ["get", "label"],
      "text-size": 12,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-pitch-alignment": "map",
      "text-rotation-alignment": "map",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "symbol-placement": "point",
    },
    paint: {
      "text-color": "#cffafe",
      "text-halo-color": "#083344",
      "text-halo-width": 1.2,
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
    id: "moon-path-full-day-line",
    type: "line",
    source: MOON_PATH_FULL_DAY_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#e2e8f0",
      "line-width": 1.6,
      "line-opacity": 0.24,
      "line-dasharray": [0.75, 1.6],
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
      "text-pitch-alignment": "map",
      "text-rotation-alignment": "map",
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
    id: "moon-path-current-dot",
    type: "circle",
    source: MOON_PATH_CURRENT_SOURCE,
    paint: {
      "circle-radius": 5,
      "circle-color": "#fef3c7",
      "circle-stroke-color": "#f59e0b",
      "circle-stroke-width": 2,
      "circle-opacity": 0.96,
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "moon-path-current-label",
    type: "symbol",
    source: MOON_PATH_CURRENT_SOURCE,
    layout: {
      "text-field": ["get", "label"],
      "text-size": 12,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-pitch-alignment": "map",
      "text-rotation-alignment": "map",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#fef3c7",
      "text-halo-color": "#422006",
      "text-halo-width": 1.2,
      "text-opacity": 0.98,
    },
  });

  map.addLayer({
    id: "transit-opportunity-corridor",
    type: "fill",
    source: SELECTED_STAND_SOURCE,
    filter: ["==", ["get", "kind"], "transitOpportunityCorridor"],
    paint: {
      "fill-color": [
        "match",
        ["get", "confidence"],
        "high",
        "#22c55e",
        "medium",
        "#4ade80",
        "#86efac",
      ],
      "fill-opacity": [
        "match",
        ["get", "confidence"],
        "high",
        0.24,
        "medium",
        0.18,
        0.12,
      ],
    },
  });
  map.addLayer({
    id: "transit-opportunity-corridor-volume-low",
    type: "fill-extrusion",
    source: SELECTED_STAND_SOURCE,
    filter: [
      "all",
      ["==", ["get", "kind"], "transitOpportunityCorridorVolume"],
      ["==", ["get", "confidence"], "low"],
    ],
    paint: {
      "fill-extrusion-color": "#86efac",
      "fill-extrusion-opacity": 0.08,
      "fill-extrusion-height": [
        "coalesce",
        ["to-number", ["get", "volumeHeightMeters"]],
        0,
      ],
      "fill-extrusion-base": 0,
    },
  });
  map.addLayer({
    id: "transit-opportunity-corridor-volume-medium",
    type: "fill-extrusion",
    source: SELECTED_STAND_SOURCE,
    filter: [
      "all",
      ["==", ["get", "kind"], "transitOpportunityCorridorVolume"],
      ["==", ["get", "confidence"], "medium"],
    ],
    paint: {
      "fill-extrusion-color": "#4ade80",
      "fill-extrusion-opacity": 0.14,
      "fill-extrusion-height": [
        "coalesce",
        ["to-number", ["get", "volumeHeightMeters"]],
        0,
      ],
      "fill-extrusion-base": 0,
    },
  });
  map.addLayer({
    id: "transit-opportunity-corridor-volume-high",
    type: "fill-extrusion",
    source: SELECTED_STAND_SOURCE,
    filter: [
      "all",
      ["==", ["get", "kind"], "transitOpportunityCorridorVolume"],
      ["==", ["get", "confidence"], "high"],
    ],
    paint: {
      "fill-extrusion-color": "#22c55e",
      "fill-extrusion-opacity": 0.2,
      "fill-extrusion-height": [
        "coalesce",
        ["to-number", ["get", "volumeHeightMeters"]],
        0,
      ],
      "fill-extrusion-base": 0,
    },
  });
  map.addLayer({
    id: "selected-aircraft-stand-fill",
    type: "fill",
    source: SELECTED_STAND_SOURCE,
    filter: ["==", ["get", "kind"], "strip"],
    paint: {
      "fill-color": "#38bdf8",
      "fill-opacity": SELECTED_STAND_MAP_FILL_OPACITY,
    },
  });
  map.addLayer({
    id: "selected-aircraft-stand-confirmed-zone",
    type: "fill",
    source: SELECTED_STAND_SOURCE,
    filter: ["==", ["get", "kind"], "confirmedZone"],
    paint: {
      "fill-color": "#22c55e",
      "fill-opacity": 0.2,
    },
  });
  map.addLayer({
    id: "selected-aircraft-stand-volume",
    type: "fill-extrusion",
    source: SELECTED_STAND_SOURCE,
    filter: ["==", ["get", "kind"], "volume"],
    paint: {
      "fill-extrusion-color": "#38bdf8",
      "fill-extrusion-opacity": 0.2,
      "fill-extrusion-height": [
        "coalesce",
        ["to-number", ["get", "volumeHeightMeters"]],
        0,
      ],
      "fill-extrusion-base": 0,
    },
  });
  map.addLayer({
    id: "selected-aircraft-stand-outline",
    type: "line",
    source: SELECTED_STAND_SOURCE,
    filter: ["==", ["get", "kind"], "strip"],
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
  map.addLayer({
    id: "selected-flight-trajectory-glow",
    type: "line",
    source: SELECTED_FLIGHT_TRAJECTORY_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#f59e0b",
      "line-width": 9,
      "line-blur": 2.4,
      "line-opacity": 0.38,
    },
  });
  map.addLayer({
    id: "selected-flight-trajectory",
    type: "line",
    source: SELECTED_FLIGHT_TRAJECTORY_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#fde68a",
      "line-width": 3,
      "line-opacity": 1,
      "line-dasharray": [0.9, 1.25],
      "line-z-offset": [
        "coalesce",
        ["to-number", ["get", "zOffsetMeters"]],
        0,
      ],
    } as unknown as Record<string, unknown>,
  });
  map.addLayer({
    id: "selected-flight-trajectory-label",
    type: "symbol",
    source: SELECTED_FLIGHT_TRAJECTORY_LABEL_SOURCE,
    layout: {
      "text-field": ["get", "label"],
      "text-size": 13,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-offset": [0, -1.1],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "symbol-placement": "point",
    },
    paint: {
      "text-color": "#fef3c7",
      "text-halo-color": "#451a03",
      "text-halo-width": 1.3,
    },
  });

  addFlightsCircleFallback(map);
  addAtcFlightsLayers(map);
  if (map.getLayer(FLIGHTS_SHADOW_LAYER_ID) && map.getLayer(FLIGHTS_LAYER_ID)) {
    map.moveLayer(FLIGHTS_SHADOW_LAYER_ID, FLIGHTS_LAYER_ID);
  }
  if (map.getLayer(FLIGHTS_LAYER_ID)) {
    map.moveLayer(FLIGHTS_LAYER_ID);
  }
  if (map.getLayer(ATC_FLIGHTS_DOT_LAYER_ID)) {
    map.moveLayer(ATC_FLIGHTS_DOT_LAYER_ID);
  }
  if (map.getLayer(ATC_FLIGHTS_PREDICTION_LAYER_ID)) {
    map.moveLayer(ATC_FLIGHTS_PREDICTION_LAYER_ID);
  }
  if (map.getLayer(ATC_FLIGHTS_LEADER_LAYER_ID)) {
    map.moveLayer(ATC_FLIGHTS_LEADER_LAYER_ID);
  }
  if (map.getLayer(ATC_FLIGHTS_LABEL_LAYER_ID)) {
    map.moveLayer(ATC_FLIGHTS_LABEL_LAYER_ID);
  }
  ensureFlightLayerWith3dModel(map);
  onLayersReady?.();
}
