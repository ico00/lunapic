import {
  ATC_FLIGHTS_DOT_LAYER_ID,
  ATC_FLIGHTS_LEADER_LAYER_ID,
  ATC_FLIGHTS_LABEL_LAYER_ID,
  ATC_FLIGHTS_PREDICTION_LAYER_ID,
  ensureFlightLayerWith3dModel,
} from "@/lib/map/registerMoonTransitLayers";
import {
  FLIGHTS_LAYER_ID,
  FLIGHTS_2D_LAYER_ID,
  VFR_OPENAIP_LAYER_ID,
  VFR_OPENAIP_MASK_LAYER_ID,
} from "@/lib/map/mapSourceIds";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useEffect, type RefObject } from "react";
import type mapboxgl from "mapbox-gl";
import type { MapDisplayMode } from "@/types/map-display";

// 3D aircraft model + its ground shadow — visible in default & VFR, hidden in
// ATC (radar dots) and 2D (flat symbol icon replaces it).
const FLIGHT_3D_LAYER_IDS = [FLIGHTS_LAYER_ID, "flights-shadow-layer"];
// Flat ground footprint of the transit corridor — shown in every mode but ATC.
const CORRIDOR_FILL_LAYER_ID = "transit-opportunity-corridor";
// Distance readout at the near edge of the corridor — follows the fill.
const CORRIDOR_LABEL_LAYER_ID = "transit-opportunity-corridor-label";
// Custom WebGL 3D corridor volume — hidden in flat 2D mode (the fill represents it).
const CORRIDOR_VOLUME_LAYER_ID = "corridor-volume-custom";

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
  // 2D mode replaces the altitude-lifted 3D model with a flat top-down symbol
  // icon clamped to the ground, so the prediction line emanates from the plane.
  const twoDMode = mode === "2d";
  // The 3D model has no parallax issue only because it's hidden in 2D.
  const hide3dFlights = atcMode || twoDMode;

  // 3D aircraft model + shadow — hidden in ATC (dots) and 2D (flat icon).
  for (const layerId of FLIGHT_3D_LAYER_IDS) {
    setLayerVisibility(map, layerId, !hide3dFlights);
  }
  // Flat 2D plane symbol — only in 2D mode.
  setLayerVisibility(map, FLIGHTS_2D_LAYER_ID, twoDMode);
  // Flat corridor footprint accompanies aircraft in every mode but ATC.
  setLayerVisibility(map, CORRIDOR_FILL_LAYER_ID, !atcMode);
  setLayerVisibility(map, CORRIDOR_LABEL_LAYER_ID, !atcMode);
  // 3D corridor volume only in the perspective modes (default/VFR) — flattened away
  // in 2D so nothing floats above the ground, and hidden in ATC.
  const corridorVolume = map.getLayer(CORRIDOR_VOLUME_LAYER_ID) as
    | { setVisible?: (visible: boolean) => void }
    | undefined;
  corridorVolume?.setVisible?.(!atcMode && !twoDMode);
  for (const layerId of ATC_ONLY_LAYER_IDS) {
    setLayerVisibility(map, layerId, atcMode);
  }
  for (const layerId of VFR_ONLY_LAYER_IDS) {
    setLayerVisibility(map, layerId, vfrMode);
  }

  // Hard fallback: some async model-layer transitions can ignore visibility
  // timing. Filter guarantees no 3D flight features render in ATC/2D modes.
  const flightsFilter = (
    hide3dFlights ? HIDE_ALL_FLIGHTS_FILTER : SHOW_ALL_FLIGHTS_FILTER
  ) as never;
  for (const layerId of FLIGHT_3D_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      try {
        map.setFilter(layerId, flightsFilter);
      } catch {
        // Layer/style can be in transition; visibility toggle already applied.
      }
    }
  }

  // Re-upgrade from circle fallback to the 3D model layer only in modes that
  // actually show it (default/VFR). NOT in 2D: ensureFlightLayerWith3dModel
  // rebuilds the layer and resets its visibility/filter, which would re-show the
  // 3D model on top of the flat 2D symbol — the same flight drawn twice.
  if (!atcMode && !twoDMode) {
    ensureFlightLayerWith3dModel(map);
  }
}

/**
 * 2D mode locks the camera to a flat, north-up top-down view: right-button (and
 * touch) rotation/pitch are disabled, and any existing bearing/pitch is reset so
 * the user is never stranded rotated with rotation turned off. Other modes keep
 * the rotation gestures enabled.
 */
function applyRotationLock(map: mapboxgl.Map, twoDMode: boolean): void {
  if (twoDMode) {
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    if (map.getBearing() !== 0 || map.getPitch() !== 0) {
      map.easeTo({ bearing: 0, pitch: 0, duration: 300 });
    }
  } else {
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();
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
    applyRotationLock(map, mapDisplayMode === "2d");
    let retryTimeoutA: ReturnType<typeof setTimeout> | null = null;
    let retryTimeoutB: ReturnType<typeof setTimeout> | null = null;
    let bootstrapped = false;

    const runApply = () => {
      bootstrapped = true;
      applyDisplayMode(map, mapDisplayMode);
      if (mapDisplayMode !== "atc" && mapDisplayMode !== "2d") {
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

