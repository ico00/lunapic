/**
 * Manages two optional Mapbox layers driven by the local ADS-B flight log:
 *   - heatmap  — density of all recorded positions (last 7 days)
 *   - routes   — semi-transparent polylines per callsign (last 30 days)
 *
 * Both layers are fetched lazily when first enabled and refreshed every 5 min.
 */

import {
  FLIGHT_HISTORY_HEATMAP_LAYER_ID,
  FLIGHT_HISTORY_HEATMAP_SOURCE,
  FLIGHT_HISTORY_ROUTES_LAYER_ID,
  FLIGHT_HISTORY_ROUTES_SOURCE,
} from "@/lib/map/mapSourceIds";
import { appPath } from "@/lib/paths/appPath";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type mapboxgl from "mapbox-gl";
import { useEffect, useRef, type RefObject } from "react";

const REFRESH_MS = 5 * 60_000;

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function ensureHeatmapSource(map: mapboxgl.Map) {
  if (!map.getSource(FLIGHT_HISTORY_HEATMAP_SOURCE)) {
    map.addSource(FLIGHT_HISTORY_HEATMAP_SOURCE, {
      type: "geojson",
      data: EMPTY_FC,
    });
  }
}

function ensureHeatmapLayer(map: mapboxgl.Map) {
  if (map.getLayer(FLIGHT_HISTORY_HEATMAP_LAYER_ID)) return;
  map.addLayer({
    id: FLIGHT_HISTORY_HEATMAP_LAYER_ID,
    type: "heatmap",
    source: FLIGHT_HISTORY_HEATMAP_SOURCE,
    maxzoom: 14,
    paint: {
      "heatmap-weight": ["get", "weight"],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 10, 2],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0, "rgba(0,0,0,0)",
        0.2, "rgba(0,100,255,0.4)",
        0.5, "rgba(0,220,120,0.6)",
        0.8, "rgba(255,200,0,0.7)",
        1.0, "rgba(255,60,0,0.85)",
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 12, 10, 30],
      "heatmap-opacity": 0.72,
    },
  });
}

function removeHeatmapLayer(map: mapboxgl.Map) {
  if (map.getLayer(FLIGHT_HISTORY_HEATMAP_LAYER_ID))
    map.removeLayer(FLIGHT_HISTORY_HEATMAP_LAYER_ID);
}

function ensureRoutesSource(map: mapboxgl.Map) {
  if (!map.getSource(FLIGHT_HISTORY_ROUTES_SOURCE)) {
    map.addSource(FLIGHT_HISTORY_ROUTES_SOURCE, {
      type: "geojson",
      data: EMPTY_FC,
    });
  }
}

function ensureRoutesLayer(map: mapboxgl.Map) {
  if (map.getLayer(FLIGHT_HISTORY_ROUTES_LAYER_ID)) return;
  map.addLayer({
    id: FLIGHT_HISTORY_ROUTES_LAYER_ID,
    type: "line",
    source: FLIGHT_HISTORY_ROUTES_SOURCE,
    paint: {
      "line-color": "rgba(100,200,255,0.22)",
      "line-width": 1.2,
      "line-blur": 0.8,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });
}

function removeRoutesLayer(map: mapboxgl.Map) {
  if (map.getLayer(FLIGHT_HISTORY_ROUTES_LAYER_ID))
    map.removeLayer(FLIGHT_HISTORY_ROUTES_LAYER_ID);
}

async function fetchHeatmap(): Promise<object> {
  const res = await fetch(appPath("/api/flight-log/heatmap?days=7"), {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`heatmap ${res.status}`);
  return res.json();
}

async function fetchRoutes(): Promise<object> {
  const res = await fetch(appPath("/api/flight-log/routes?days=30"), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`routes ${res.status}`);
  return res.json();
}

export function useFlightHistoryLayers(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number
): void {
  const heatmapEnabled = useMoonTransitStore((s) => s.flightHistoryHeatmap);
  const routesEnabled = useMoonTransitStore((s) => s.flightHistoryRoutes);

  const heatmapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routesTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Heatmap
  useEffect(() => {
    if (mapReadyTick === 0) return;
    const map = mapRef.current;
    if (!map) return;

    if (!heatmapEnabled) {
      removeHeatmapLayer(map);
      if (heatmapTimerRef.current) {
        clearInterval(heatmapTimerRef.current);
        heatmapTimerRef.current = null;
      }
      return;
    }

    ensureHeatmapSource(map);
    ensureHeatmapLayer(map);

    const load = async () => {
      try {
        const data = await fetchHeatmap();
        const src = map.getSource(
          FLIGHT_HISTORY_HEATMAP_SOURCE
        ) as mapboxgl.GeoJSONSource | undefined;
        src?.setData(data as Parameters<typeof src.setData>[0]);
      } catch {
        // silent — layer shows stale data
      }
    };

    load();
    heatmapTimerRef.current = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (heatmapTimerRef.current) clearInterval(heatmapTimerRef.current);
      heatmapTimerRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [heatmapEnabled, mapReadyTick, mapRef]);

  // Routes
  useEffect(() => {
    if (mapReadyTick === 0) return;
    const map = mapRef.current;
    if (!map) return;

    if (!routesEnabled) {
      removeRoutesLayer(map);
      if (routesTimerRef.current) {
        clearInterval(routesTimerRef.current);
        routesTimerRef.current = null;
      }
      return;
    }

    ensureRoutesSource(map);
    ensureRoutesLayer(map);

    const load = async () => {
      try {
        const data = await fetchRoutes();
        const src = map.getSource(
          FLIGHT_HISTORY_ROUTES_SOURCE
        ) as mapboxgl.GeoJSONSource | undefined;
        src?.setData(data as Parameters<typeof src.setData>[0]);
      } catch {
        // silent
      }
    };

    load();
    routesTimerRef.current = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (routesTimerRef.current) clearInterval(routesTimerRef.current);
      routesTimerRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [routesEnabled, mapReadyTick, mapRef]);
}
