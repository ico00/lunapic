/**
 * Manages two optional Mapbox layers driven by the local ADS-B flight log:
 *   - heatmap  — zoom-consistent density surface: the 0.05° server grid
 *                rendered client-side into a georeferenced raster with
 *                bilinear interpolation (last 7 days), optionally filtered
 *                to a viewer-local hour-of-day window
 *   - routes   — semi-transparent polyline per flight pass (last 7 days)
 *
 * Both layers are fetched lazily when first enabled and refreshed every 5 min.
 */

import {
  FLIGHT_HISTORY_HEATMAP_LAYER_ID,
  FLIGHT_HISTORY_HEATMAP_SOURCE,
  FLIGHT_HISTORY_ROUTES_LAYER_ID,
  FLIGHT_HISTORY_ROUTES_SOURCE,
} from "@/lib/map/mapSourceIds";
import { altitudePropertyColorMapboxExpression } from "@/lib/map/flightAltitudeColor";
import { appPath } from "@/lib/paths/appPath";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type mapboxgl from "mapbox-gl";
import { useEffect, useRef, type RefObject } from "react";

const REFRESH_MS = 5 * 60_000;

/** Lookback for both history layers. Exported so the layer toggles can label
 *  the window instead of restating a number that could drift from the fetch. */
export const FLIGHT_HISTORY_DAYS = 7;

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

/**
 * The density surface is a georeferenced raster (image source), not a Mapbox
 * `heatmap` layer and not a vector fill:
 *   - `heatmap` (screen-space kernel) was rejected — it saturates to uniform
 *     red when zoomed out and falls apart into a dot lattice when zoomed in;
 *   - a per-cell `fill` choropleth is zoom-consistent but reads as hard squares.
 * Rendering the grid into an image with bilinear interpolation keeps colours a
 * pure function of the data (identical at every zoom — the image is pinned to
 * coordinates) while blending smoothly between cell centres.
 */
function setHeatmapImage(map: mapboxgl.Map, image: HeatmapImage) {
  const src = map.getSource(FLIGHT_HISTORY_HEATMAP_SOURCE);
  if (src && src.type !== "image") {
    // Stale source from a previous build of this hook (dev HMR keeps the map
    // instance alive) — replace it wholesale.
    if (map.getLayer(FLIGHT_HISTORY_HEATMAP_LAYER_ID))
      map.removeLayer(FLIGHT_HISTORY_HEATMAP_LAYER_ID);
    map.removeSource(FLIGHT_HISTORY_HEATMAP_SOURCE);
  }
  const imgSrc = map.getSource(FLIGHT_HISTORY_HEATMAP_SOURCE) as
    | mapboxgl.ImageSource
    | undefined;
  if (imgSrc) imgSrc.updateImage(image);
  else map.addSource(FLIGHT_HISTORY_HEATMAP_SOURCE, { type: "image", ...image });
}

function ensureHeatmapLayer(map: mapboxgl.Map) {
  if (map.getLayer(FLIGHT_HISTORY_HEATMAP_LAYER_ID)) return;
  map.addLayer({
    id: FLIGHT_HISTORY_HEATMAP_LAYER_ID,
    type: "raster",
    source: FLIGHT_HISTORY_HEATMAP_SOURCE,
    paint: {
      "raster-fade-duration": 0,
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
      // Corridor colour = median altitude over the area (same ramp as live
      // aircraft): red/orange = approach/descent, blue/violet = high cruise.
      "line-color": altitudePropertyColorMapboxExpression("medianAltM") as never,
      "line-opacity": 0.3,
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

type HeatmapCellFeature = {
  type: "Feature";
  properties: { count: number; weight: number };
  geometry: { type: "Point"; coordinates: [number, number] };
};

type HeatmapApiResponse = {
  features?: HeatmapCellFeature[];
  meta?: { resolution?: number };
};

type HeatmapImage = {
  url: string;
  coordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
};

/** Colour ramp over the log-scaled weight (0..1), straight RGBA. Same hues as
 *  the live-aircraft density look: blue → green → yellow → red. Alpha starts
 *  at 0 so the surface fades out cleanly toward unvisited cells. */
const HEATMAP_RAMP: Array<[number, number, number, number, number]> = [
  [0.0, 0, 100, 255, 0],
  [0.2, 0, 100, 255, 0.4],
  [0.5, 0, 220, 120, 0.6],
  [0.8, 255, 200, 0, 0.7],
  [1.0, 255, 60, 0, 0.85],
];

function weightToRgba(w: number): [number, number, number, number] {
  const ramp = HEATMAP_RAMP;
  if (w <= ramp[0][0]) return [ramp[0][1], ramp[0][2], ramp[0][3], ramp[0][4]];
  for (let i = 1; i < ramp.length; i++) {
    if (w <= ramp[i][0]) {
      const [w0, r0, g0, b0, a0] = ramp[i - 1];
      const [w1, r1, g1, b1, a1] = ramp[i];
      const t = (w - w0) / (w1 - w0);
      return [
        r0 + t * (r1 - r0),
        g0 + t * (g1 - g0),
        b0 + t * (b1 - b0),
        a0 + t * (a1 - a0),
      ];
    }
  }
  const last = ramp[ramp.length - 1];
  return [last[1], last[2], last[3], last[4]];
}

const mercY = (latDeg: number) =>
  Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360));
const invMercY = (y: number) =>
  ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

/** Output pixels per grid cell — 8 is plenty for a smooth surface. */
const CELL_UPSAMPLE_PX = 8;
const MAX_IMAGE_DIM_PX = 2048;

/**
 * Rasterise the cell grid into a PNG data URL with bilinear interpolation
 * between cell centres, plus its geographic corner coordinates.
 */
function buildHeatmapImage(data: HeatmapApiResponse): HeatmapImage | null {
  const cells = data.features ?? [];
  if (cells.length === 0) return null;
  const res = data.meta?.resolution ?? 0.05;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const f of cells) {
    const [lng, lat] = f.geometry.coordinates;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const cols = Math.round((maxLng - minLng) / res) + 1;
  const rows = Math.round((maxLat - minLat) / res) + 1;
  // One-cell zero ring around the data so the surface interpolates down to
  // transparent at the border instead of ending in a hard edge.
  const pc = cols + 2;
  const pr = rows + 2;
  const W = new Float32Array(pr * pc);
  for (const f of cells) {
    const [lng, lat] = f.geometry.coordinates;
    const c = Math.round((lng - minLng) / res) + 1;
    const r = Math.round((maxLat - lat) / res) + 1;
    W[r * pc + c] = f.properties.weight;
  }

  // Image bounds run through the padded ring's cell centres (value 0 there).
  const west = minLng - res;
  const east = maxLng + res;
  const north = maxLat + res;
  const south = minLat - res;

  const width = Math.min(pc * CELL_UPSAMPLE_PX, MAX_IMAGE_DIM_PX);
  const height = Math.min(pr * CELL_UPSAMPLE_PX, MAX_IMAGE_DIM_PX);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(width, height);
  const px = img.data;

  const mercN = mercY(north);
  const mercS = mercY(south);
  for (let y = 0; y < height; y++) {
    // Mapbox draws the image linearly in mercator space, so step rows in
    // mercator and convert back — otherwise cell rows drift off their true
    // latitudes (~half a cell over a 2.5° span).
    const lat = invMercY(mercN + ((y + 0.5) / height) * (mercS - mercN));
    const gy = (north - lat) / res;
    const r0 = Math.min(Math.max(Math.floor(gy), 0), pr - 2);
    const fy = Math.min(Math.max(gy - r0, 0), 1);
    for (let x = 0; x < width; x++) {
      const gx = ((x + 0.5) / width) * (pc - 1);
      const c0 = Math.min(Math.max(Math.floor(gx), 0), pc - 2);
      const fx = Math.min(Math.max(gx - c0, 0), 1);
      const w =
        W[r0 * pc + c0] * (1 - fx) * (1 - fy) +
        W[r0 * pc + c0 + 1] * fx * (1 - fy) +
        W[(r0 + 1) * pc + c0] * (1 - fx) * fy +
        W[(r0 + 1) * pc + c0 + 1] * fx * fy;
      const [red, green, blue, alpha] = weightToRgba(w);
      const o = (y * width + x) * 4;
      px[o] = red;
      px[o + 1] = green;
      px[o + 2] = blue;
      px[o + 3] = alpha * 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    url: canvas.toDataURL("image/png"),
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  };
}

async function fetchHeatmap(hourFilter: { from: number; to: number } | null): Promise<HeatmapApiResponse> {
  const params = new URLSearchParams({ days: String(FLIGHT_HISTORY_DAYS) });
  if (hourFilter) {
    params.set("hourFrom", String(hourFilter.from));
    params.set("hourTo", String(hourFilter.to));
    // JS offset is minutes *behind* UTC (UTC+2 → -120); the API adds it to epoch
    // ms, so flip the sign to shift into viewer-local time.
    params.set("tzOffMin", String(-new Date().getTimezoneOffset()));
  }
  const res = await fetch(appPath(`/api/flight-log/heatmap?${params}`), {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`heatmap ${res.status}`);
  return res.json();
}

async function fetchRoutes(): Promise<object> {
  const res = await fetch(
    appPath(`/api/flight-log/routes?days=${FLIGHT_HISTORY_DAYS}`),
    {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) throw new Error(`routes ${res.status}`);
  return res.json();
}

export function useFlightHistoryLayers(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number
): void {
  const heatmapEnabled = useMoonTransitStore((s) => s.flightHistoryHeatmap);
  const hourFilter = useMoonTransitStore((s) => s.flightHistoryHourFilter);
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

    const load = async () => {
      try {
        const data = await fetchHeatmap(hourFilter);
        const image = buildHeatmapImage(data);
        if (!image) {
          removeHeatmapLayer(map);
          return;
        }
        setHeatmapImage(map, image);
        ensureHeatmapLayer(map);
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
  }, [heatmapEnabled, hourFilter, mapReadyTick, mapRef]);

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
