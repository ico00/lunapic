/**
 * Draws the LDZA runway planner (Planning panel) on the map.
 *
 * Colour follows §11.1 of the design spec: the whole "stand here" family is
 * emerald. The two flows are told apart by dash pattern, not hue, so the pair
 * survives colour-blind viewing and never borrows amber (reserved for the
 * aircraft's own motion and the Moon-arc clock):
 *   - landing 04   — solid
 *   - departure 22 — dashed
 * Each line carries a clock label at its near end; markers carry the aircraft's
 * width in Moon diameters (`4.1×`) at 4/6/8/10/12 km out.
 */

import { fitGeoJsonBounds } from "@/lib/map/fitGeoJsonBounds";
import {
  RUNWAY_PLAN_LINE_DEPARTURE_LAYER_ID,
  RUNWAY_PLAN_LINE_LAYER_ID,
  RUNWAY_PLAN_MARKER_LABEL_LAYER_ID,
  RUNWAY_PLAN_MARKER_LAYER_ID,
  RUNWAY_PLAN_SOURCE,
  RUNWAY_PLAN_TIME_LAYER_ID,
} from "@/lib/map/mapSourceIds";
import { buildRunwayShadowPlanFeatures } from "@/lib/map/runwayShadowPlanFeatures";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type mapboxgl from "mapbox-gl";
import { useEffect, useMemo, type RefObject } from "react";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

const ACTIVE_OPACITY = ["case", ["get", "active"], 1, 0.22] as mapboxgl.ExpressionSpecification;

function ensureLayers(map: mapboxgl.Map) {
  if (!map.getSource(RUNWAY_PLAN_SOURCE)) {
    map.addSource(RUNWAY_PLAN_SOURCE, { type: "geojson", data: EMPTY_FC });
  }

  if (!map.getLayer(RUNWAY_PLAN_LINE_LAYER_ID)) {
    map.addLayer({
      id: RUNWAY_PLAN_LINE_LAYER_ID,
      type: "line",
      source: RUNWAY_PLAN_SOURCE,
      filter: ["all", ["==", ["get", "kind"], "line"], ["==", ["get", "flow"], "landing04"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#34d399",
        "line-width": 4,
        "line-opacity": ACTIVE_OPACITY,
      },
    });
  }
  if (!map.getLayer(RUNWAY_PLAN_LINE_DEPARTURE_LAYER_ID)) {
    map.addLayer({
      id: RUNWAY_PLAN_LINE_DEPARTURE_LAYER_ID,
      type: "line",
      source: RUNWAY_PLAN_SOURCE,
      filter: ["all", ["==", ["get", "kind"], "line"], ["==", ["get", "flow"], "departure22"]],
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": "#34d399",
        "line-width": 4,
        "line-dasharray": [2, 1.5],
        "line-opacity": ACTIVE_OPACITY,
      },
    });
  }
  if (!map.getLayer(RUNWAY_PLAN_MARKER_LAYER_ID)) {
    map.addLayer({
      id: RUNWAY_PLAN_MARKER_LAYER_ID,
      type: "circle",
      source: RUNWAY_PLAN_SOURCE,
      filter: ["==", ["get", "kind"], "marker"],
      paint: {
        "circle-radius": 4.5,
        "circle-color": "#34d399",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(255,255,255,0.9)",
        "circle-opacity": ACTIVE_OPACITY,
        "circle-stroke-opacity": ACTIVE_OPACITY,
      },
    });
  }
  if (!map.getLayer(RUNWAY_PLAN_MARKER_LABEL_LAYER_ID)) {
    map.addLayer({
      id: RUNWAY_PLAN_MARKER_LABEL_LAYER_ID,
      type: "symbol",
      source: RUNWAY_PLAN_SOURCE,
      // Only the focused instant is labelled with coverage; otherwise 10+ lines
      // of labels would bury the geometry they annotate.
      filter: ["all", ["==", ["get", "kind"], "marker"], ["==", ["get", "active"], true]],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-offset": [0, -1.3],
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#a7f3d0", // emerald-200
        "text-halo-color": "#0f172a",
        "text-halo-width": 1.2,
      },
    });
  }
  if (!map.getLayer(RUNWAY_PLAN_TIME_LAYER_ID)) {
    map.addLayer({
      id: RUNWAY_PLAN_TIME_LAYER_ID,
      type: "symbol",
      source: RUNWAY_PLAN_SOURCE,
      filter: ["==", ["get", "kind"], "time"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-offset": [0, 1.2],
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#e2e8f0",
        "text-halo-color": "#0f172a",
        "text-halo-width": 1.4,
        "text-opacity": ACTIVE_OPACITY,
      },
    });
  }
}

export function useRunwayPlanLayer(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number
): void {
  const lines = useMoonTransitStore((s) => s.runwayPlanLines);
  const focusMs = useMoonTransitStore((s) => s.runwayPlanFocusMs);
  const showAll = useMoonTransitStore((s) => s.runwayPlanShowAll);
  const pack = useMemo(
    () => buildRunwayShadowPlanFeatures(lines, focusMs, !showAll),
    [lines, focusMs, showAll]
  );

  useEffect(() => {
    if (mapReadyTick === 0) return;
    const map = mapRef.current;
    if (!map) return;
    // Nothing planned: do not create sources/layers for a feature nobody opened.
    if (lines.length === 0 && !map.getSource(RUNWAY_PLAN_SOURCE)) return;

    ensureLayers(map);
    (map.getSource(RUNWAY_PLAN_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(pack);
  }, [mapRef, mapReadyTick, lines, pack]);

  // Bring the plan into view only when the set of lines changes — not on every
  // focus change, which would fight the user's own panning.
  useEffect(() => {
    if (mapReadyTick === 0 || lines.length === 0) return;
    const map = mapRef.current;
    if (!map) return;
    fitGeoJsonBounds(map, buildRunwayShadowPlanFeatures(lines, null), { maxZoom: 12 });
  }, [mapRef, mapReadyTick, lines]);
}
