import {
  buildAirportRunwayLabelFeatures,
  buildAirportRunwayLineFeature,
} from "@/lib/map/airportRunwayConfig";
import {
  AIRPORT_RUNWAY_LABEL_LAYER_ID,
  AIRPORT_RUNWAY_LABEL_SOURCE,
  AIRPORT_RUNWAY_LAYER_ID,
  AIRPORT_RUNWAY_PAVEMENT_LAYER_ID,
  AIRPORT_RUNWAY_SOURCE,
} from "@/lib/map/mapSourceIds";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type mapboxgl from "mapbox-gl";
import { useEffect, type RefObject } from "react";

function ensureRunwayLayers(map: mapboxgl.Map) {
  if (!map.getSource(AIRPORT_RUNWAY_SOURCE)) {
    map.addSource(AIRPORT_RUNWAY_SOURCE, {
      type: "geojson",
      data: buildAirportRunwayLineFeature(),
    });
  }
  if (!map.getSource(AIRPORT_RUNWAY_LABEL_SOURCE)) {
    map.addSource(AIRPORT_RUNWAY_LABEL_SOURCE, {
      type: "geojson",
      data: buildAirportRunwayLabelFeatures(),
    });
  }
  if (!map.getLayer(AIRPORT_RUNWAY_LAYER_ID)) {
    map.addLayer({
      id: AIRPORT_RUNWAY_LAYER_ID,
      type: "line",
      source: AIRPORT_RUNWAY_SOURCE,
      filter: ["==", ["get", "segment"], "extension"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#94a3b8",
        "line-width": 2,
        "line-opacity": 0.55,
        "line-dasharray": [2, 2],
      },
    });
  }
  if (!map.getLayer(AIRPORT_RUNWAY_PAVEMENT_LAYER_ID)) {
    map.addLayer({
      id: AIRPORT_RUNWAY_PAVEMENT_LAYER_ID,
      type: "line",
      source: AIRPORT_RUNWAY_SOURCE,
      filter: ["==", ["get", "segment"], "pavement"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#f59e0b",
        "line-width": 3,
        "line-opacity": 0.85,
        "line-dasharray": [2, 2],
      },
    });
  }
  if (!map.getLayer(AIRPORT_RUNWAY_LABEL_LAYER_ID)) {
    map.addLayer({
      id: AIRPORT_RUNWAY_LABEL_LAYER_ID,
      type: "symbol",
      source: AIRPORT_RUNWAY_LABEL_SOURCE,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#cbd5e1",
        "text-halo-color": "#0f172a",
        "text-halo-width": 1.2,
      },
    });
  }
}

function removeRunwayLayers(map: mapboxgl.Map) {
  if (map.getLayer(AIRPORT_RUNWAY_LABEL_LAYER_ID)) map.removeLayer(AIRPORT_RUNWAY_LABEL_LAYER_ID);
  if (map.getLayer(AIRPORT_RUNWAY_PAVEMENT_LAYER_ID)) map.removeLayer(AIRPORT_RUNWAY_PAVEMENT_LAYER_ID);
  if (map.getLayer(AIRPORT_RUNWAY_LAYER_ID)) map.removeLayer(AIRPORT_RUNWAY_LAYER_ID);
}

/** Static LDZA runway 04/22 centerline overlay, shown only when the user enables it. */
export function useAirportRunwayLayer(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number
): void {
  const enabled = useMoonTransitStore((s) => s.airportRunwayOverlay);

  useEffect(() => {
    if (mapReadyTick === 0) return;
    const map = mapRef.current;
    if (!map) return;
    if (!enabled) {
      removeRunwayLayers(map);
      return;
    }
    ensureRunwayLayers(map);
  }, [enabled, mapReadyTick, mapRef]);
}
