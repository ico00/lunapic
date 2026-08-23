/**
 * Draws the "stand here" opportunity selected in the Flight log panel.
 *
 * Four shapes at three scales, because the useful answer is not just a pin:
 *   - spread circle (sky, faint)   — historical scatter of the callsign's track
 *   - tolerance ellipse (emerald)  — where you must actually stand
 *   - spot point + label (emerald) — the target itself
 *   - shadow path (amber, dashed)  — where the spot travels during the pass
 *
 * Colour semantics follow the palette in §2.7 of the design spec: emerald for
 * the target, amber for anything time-related, sky for secondary information.
 *
 * The panel owns the fetch; this hook only renders `photoSpotSelected`.
 */

import {
  PHOTO_SPOT_LABEL_LAYER_ID,
  PHOTO_SPOT_PATH_LAYER_ID,
  PHOTO_SPOT_PATH_SOURCE,
  PHOTO_SPOT_POINT_LAYER_ID,
  PHOTO_SPOT_SOURCE,
  PHOTO_SPOT_SPREAD_LAYER_ID,
  PHOTO_SPOT_TOLERANCE_LAYER_ID,
} from "@/lib/map/mapSourceIds";
import { fitGeoJsonBounds } from "@/lib/map/fitGeoJsonBounds";
import { buildPhotoSpotFeatures } from "@/lib/map/photoSpotFeatures";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type mapboxgl from "mapbox-gl";
import { useEffect, type RefObject } from "react";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function ensureLayers(map: mapboxgl.Map) {
  if (!map.getSource(PHOTO_SPOT_PATH_SOURCE)) {
    map.addSource(PHOTO_SPOT_PATH_SOURCE, { type: "geojson", data: EMPTY_FC });
  }
  if (!map.getSource(PHOTO_SPOT_SOURCE)) {
    map.addSource(PHOTO_SPOT_SOURCE, { type: "geojson", data: EMPTY_FC });
  }

  if (!map.getLayer(PHOTO_SPOT_PATH_LAYER_ID)) {
    map.addLayer({
      id: PHOTO_SPOT_PATH_LAYER_ID,
      type: "line",
      source: PHOTO_SPOT_PATH_SOURCE,
      paint: {
        // Matches the live centerline: emerald for the whole "stand here"
        // family (spot, tolerance ellipse, and the track the spot sweeps), so
        // amber is left to mean the aircraft's own predicted motion.
        "line-color": "rgba(52,211,153,0.75)",
        "line-width": 2,
        "line-dasharray": [5, 3],
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }
  if (!map.getLayer(PHOTO_SPOT_SPREAD_LAYER_ID)) {
    map.addLayer({
      id: PHOTO_SPOT_SPREAD_LAYER_ID,
      type: "fill",
      source: PHOTO_SPOT_SOURCE,
      filter: ["==", ["get", "kind"], "spread"],
      paint: {
        "fill-color": "rgba(56,189,248,0.10)", // sky-400 — uncertainty, not a target
        "fill-outline-color": "rgba(56,189,248,0.35)",
      },
    });
  }
  if (!map.getLayer(PHOTO_SPOT_TOLERANCE_LAYER_ID)) {
    map.addLayer({
      id: PHOTO_SPOT_TOLERANCE_LAYER_ID,
      type: "fill",
      source: PHOTO_SPOT_SOURCE,
      filter: ["==", ["get", "kind"], "tolerance"],
      paint: {
        "fill-color": "rgba(52,211,153,0.35)", // emerald-400
        "fill-outline-color": "rgba(52,211,153,0.9)",
      },
    });
  }
  if (!map.getLayer(PHOTO_SPOT_POINT_LAYER_ID)) {
    map.addLayer({
      id: PHOTO_SPOT_POINT_LAYER_ID,
      type: "circle",
      source: PHOTO_SPOT_SOURCE,
      filter: ["==", ["get", "kind"], "spot"],
      paint: {
        "circle-radius": 6,
        "circle-color": "#34d399",
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.9)",
      },
    });
  }
  if (!map.getLayer(PHOTO_SPOT_LABEL_LAYER_ID)) {
    map.addLayer({
      id: PHOTO_SPOT_LABEL_LAYER_ID,
      type: "symbol",
      source: PHOTO_SPOT_SOURCE,
      filter: ["==", ["get", "kind"], "spot"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-offset": [0, -1.4],
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#a7f3d0", // emerald-200
        "text-halo-color": "#0f172a",
        "text-halo-width": 1.2,
      },
    });
  }
}

export function usePhotoSpotLayer(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number
): void {
  const spot = useMoonTransitStore((s) => s.photoSpotSelected);

  useEffect(() => {
    if (mapReadyTick === 0) return;
    const map = mapRef.current;
    if (!map) return;

    ensureLayers(map);
    const pack = buildPhotoSpotFeatures(spot);
    (map.getSource(PHOTO_SPOT_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(
      pack.spot
    );
    (map.getSource(PHOTO_SPOT_PATH_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(
      pack.path
    );

    // The spot can be tens of kilometres outside the current viewport — a
    // selection nobody can see is not an answer. `fitGeoJsonBounds` no-ops on
    // the empty collection, so deselecting leaves the camera alone.
    fitGeoJsonBounds(map, pack.path, { maxZoom: 12 });
  }, [mapRef, mapReadyTick, spot]);
}
