import {
  ATC_FLIGHTS_DOT_LAYER_ID,
  ATC_FLIGHTS_LEADER_LAYER_ID,
  ATC_FLIGHTS_LABEL_LAYER_ID,
  ATC_FLIGHTS_PREDICTION_LAYER_ID,
  ensureFlightLayerWith3dModel,
} from "@/lib/map/registerMoonTransitLayers";
import { FLIGHTS_LAYER_ID, VFR_OPENAIP_LAYER_ID, VFR_OPENAIP_MASK_LAYER_ID } from "@/lib/map/mapSourceIds";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useEffect, type RefObject } from "react";
import type mapboxgl from "mapbox-gl";
import type { MapDisplayMode } from "@/types/map-display";

const DEFAULT_ONLY_LAYER_IDS = [
  FLIGHTS_LAYER_ID,
  "flights-shadow-layer",
  "transit-opportunity-corridor-volume-low",
  "transit-opportunity-corridor-volume-medium",
  "transit-opportunity-corridor-volume-high",
  "transit-opportunity-corridor",
];

const ATC_ONLY_LAYER_IDS = [
  ATC_FLIGHTS_DOT_LAYER_ID,
  ATC_FLIGHTS_PREDICTION_LAYER_ID,
  ATC_FLIGHTS_LEADER_LAYER_ID,
  ATC_FLIGHTS_LABEL_LAYER_ID,
];
const VFR_ONLY_LAYER_IDS = [VFR_OPENAIP_LAYER_ID, VFR_OPENAIP_MASK_LAYER_ID];
const HIDE_ALL_FLIGHTS_FILTER = ["==", ["get", "id"], "__atc_hidden__"] as const;
const SHOW_ALL_FLIGHTS_FILTER = ["has", "id"] as const;

function setLayerVisibility(
  map: mapboxgl.Map,
  layerId: string,
  visible: boolean
): void {
  if (!map.getLayer(layerId)) {
    return;
  }
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

function applyDisplayMode(map: mapboxgl.Map, mode: MapDisplayMode): void {
  const atcMode = mode === "atc";
  const vfrMode = mode === "vfr";

  // Default aircraft (3D model) — visible in default and VFR modes.
  for (const layerId of DEFAULT_ONLY_LAYER_IDS) {
    setLayerVisibility(map, layerId, !atcMode);
  }
  for (const layerId of ATC_ONLY_LAYER_IDS) {
    setLayerVisibility(map, layerId, atcMode);
  }
  for (const layerId of VFR_ONLY_LAYER_IDS) {
    setLayerVisibility(map, layerId, vfrMode);
  }

  // Hard fallback: some async model-layer transitions can ignore visibility timing.
  // Filter guarantees no default flight features are rendered in ATC mode.
  if (map.getLayer(FLIGHTS_LAYER_ID)) {
    try {
      map.setFilter(
        FLIGHTS_LAYER_ID,
        (atcMode ? HIDE_ALL_FLIGHTS_FILTER : SHOW_ALL_FLIGHTS_FILTER) as never
      );
    } catch {
      // Layer/style can be in transition; visibility toggle already applied above.
    }
  }
  if (map.getLayer("flights-shadow-layer")) {
    try {
      map.setFilter(
        "flights-shadow-layer",
        (atcMode ? HIDE_ALL_FLIGHTS_FILTER : SHOW_ALL_FLIGHTS_FILTER) as never
      );
    } catch {
      // Layer/style can be in transition; visibility toggle already applied above.
    }
  }

  // When returning from ATC mode, force re-upgrade from circle fallback to model layer.
  if (!atcMode) {
    ensureFlightLayerWith3dModel(map);
  }
}

export function useMapDisplayMode(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number
): void {
  const mapDisplayMode = useMoonTransitStore((s) => s.mapDisplayMode);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    let retryTimeoutA: ReturnType<typeof setTimeout> | null = null;
    let retryTimeoutB: ReturnType<typeof setTimeout> | null = null;
    let bootstrapped = false;

    const runApply = () => {
      bootstrapped = true;
      applyDisplayMode(map, mapDisplayMode);
      if (mapDisplayMode !== "atc") {
        // Startup hardening: model loading can be slightly late on first app load.
        retryTimeoutA = setTimeout(() => {
          ensureFlightLayerWith3dModel(map);
        }, 700);
        retryTimeoutB = setTimeout(() => {
          ensureFlightLayerWith3dModel(map);
        }, 1800);
      }
    };

    if (map.isStyleLoaded()) {
      runApply();
    } else {
      map.once("idle", runApply);
    }

    const handleIdle = () => {
      if (!bootstrapped) {
        return;
      }
      applyDisplayMode(map, mapDisplayMode);
    };
    map.on("idle", handleIdle);
    return () => {
      map.off("idle", handleIdle);
      if (retryTimeoutA != null) {
        clearTimeout(retryTimeoutA);
      }
      if (retryTimeoutB != null) {
        clearTimeout(retryTimeoutB);
      }
    };
  }, [mapDisplayMode, mapReadyTick, mapRef]);
}

