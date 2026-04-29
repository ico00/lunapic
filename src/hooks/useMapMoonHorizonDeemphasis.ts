import {
  SELECTED_STAND_MAP_FILL_OPACITY,
  SELECTED_STAND_MAP_FILL_OPACITY_DIM,
  SELECTED_STAND_MAP_LINE_OPACITY,
  SELECTED_STAND_MAP_LINE_OPACITY_DIM,
  SELECTED_STAND_SPINE_LINE_OPACITY,
  SELECTED_STAND_SPINE_LINE_OPACITY_DIM,
} from "@/lib/map/mapOverlayConstants";
import type { Map } from "mapbox-gl";
import { useEffect, type RefObject } from "react";

const MOON_LAYER_PAINT: readonly {
  id: string;
  prop: "line-opacity" | "fill-opacity" | "text-opacity" | "circle-opacity";
  bright: number;
  dim: number;
}[] = [
  { id: "moon-az-glow", prop: "line-opacity", bright: 0.24, dim: 0.1 },
  { id: "moon-az-core", prop: "line-opacity", bright: 0.95, dim: 0.12 },
  {
    id: "moon-path-full-day-line",
    prop: "line-opacity",
    bright: 0.24,
    dim: 0.08,
  },
  { id: "moon-path-line", prop: "line-opacity", bright: 0.9, dim: 0.1 },
  {
    id: "moon-path-labels",
    prop: "text-opacity",
    bright: 1,
    dim: 0.18,
  },
  {
    id: "moon-path-current-dot",
    prop: "circle-opacity",
    bright: 0.96,
    dim: 0.2,
  },
  {
    id: "moon-path-current-label",
    prop: "text-opacity",
    bright: 0.98,
    dim: 0.26,
  },
  {
    id: "moon-intersections",
    prop: "circle-opacity",
    bright: 0.95,
    dim: 0.15,
  },
  { id: "optimal-ground-line", prop: "line-opacity", bright: 0.4, dim: 0.08 },
  {
    id: "selected-aircraft-stand-fill",
    prop: "fill-opacity",
    bright: SELECTED_STAND_MAP_FILL_OPACITY,
    dim: SELECTED_STAND_MAP_FILL_OPACITY_DIM,
  },
  {
    id: "selected-aircraft-stand-outline",
    prop: "line-opacity",
    bright: SELECTED_STAND_MAP_LINE_OPACITY,
    dim: SELECTED_STAND_MAP_LINE_OPACITY_DIM,
  },
  {
    id: "selected-stand-spine-backing",
    prop: "line-opacity",
    bright: 0.9,
    dim: 0.14,
  },
  {
    id: "selected-stand-spine",
    prop: "line-opacity",
    bright: SELECTED_STAND_SPINE_LINE_OPACITY,
    dim: SELECTED_STAND_SPINE_LINE_OPACITY_DIM,
  },
];

/**
 * Smanji vidljivost mjesečine na karti kad je Mjesec ispod obzora (sim. vrijeme).
 */
export function useMapMoonHorizonDeemphasis(
  mapRef: RefObject<Map | null>,
  mapReadyTick: number,
  moonBelowHorizon: boolean
): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }
    for (const l of MOON_LAYER_PAINT) {
      if (!map.getLayer(l.id)) {
        continue;
      }
      const o = moonBelowHorizon ? l.dim : l.bright;
      map.setPaintProperty(l.id, l.prop, o);
    }
  }, [mapRef, mapReadyTick, moonBelowHorizon]);
}
