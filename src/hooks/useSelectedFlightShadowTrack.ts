/**
 * Live "stand here" centerline for the selected aircraft.
 *
 * Renders the ground track the aircraft's Moon shadow sweeps over the next five
 * minutes, the current spot on that line, and the tolerance ellipse around it.
 * Together they answer the only question a live transit leaves open once the
 * aircraft is already inbound: *am I on the line, and if not, which way?*
 *
 * ## Why this recomputes on a slow bucket
 *
 * Each rebuild solves ~21 ground points, each one a short Newton iteration over
 * the ephemeris. Running that on the shared 4 Hz field tick would repeat the
 * mistake documented in AGENTS.md (duplicated per-tick transit maths pinning
 * the CPU), for no visible benefit — the spot moves ~1 km in 5 s, which at any
 * usable zoom is a smooth enough step. So the clock is bucketed and the flight
 * object identity (one new object per poll) does the rest.
 */

import {
  buildLiveShadowTrack,
  type LiveShadowTrack,
} from "@/lib/domain/geometry/liveShadowTrack";
import { buildLiveShadowFeatures } from "@/lib/map/liveShadowFeatures";
import {
  LIVE_SHADOW_PATH_LAYER_ID,
  LIVE_SHADOW_PATH_SOURCE,
  LIVE_SHADOW_POINT_LAYER_ID,
  LIVE_SHADOW_SOURCE,
  LIVE_SHADOW_TICK_LAYER_ID,
  LIVE_SHADOW_TOLERANCE_LAYER_ID,
} from "@/lib/map/mapSourceIds";
import type { GroundObserver } from "@/types";
import type { FlightState } from "@/types/flight";
import type mapboxgl from "mapbox-gl";
import { useEffect, useMemo, type RefObject } from "react";

/** Rebuild cadence. The spot travels ~1 km in this time. */
const RECOMPUTE_BUCKET_MS = 5_000;

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function ensureLayers(map: mapboxgl.Map) {
  if (!map.getSource(LIVE_SHADOW_PATH_SOURCE)) {
    map.addSource(LIVE_SHADOW_PATH_SOURCE, { type: "geojson", data: EMPTY_FC });
  }
  if (!map.getSource(LIVE_SHADOW_SOURCE)) {
    map.addSource(LIVE_SHADOW_SOURCE, { type: "geojson", data: EMPTY_FC });
  }
  if (!map.getLayer(LIVE_SHADOW_PATH_LAYER_ID)) {
    map.addLayer({
      id: LIVE_SHADOW_PATH_LAYER_ID,
      type: "line",
      source: LIVE_SHADOW_PATH_SOURCE,
      filter: ["==", ["get", "kind"], "path"],
      paint: {
        // Emerald, like the spot it is the trace of. It used to be amber, which
        // put it in the same colour *and* dash family as the selected flight's
        // own `+90s` trajectory prediction (`#fde68a`, fine dashes) — two amber
        // dashed lines about two different objects, indistinguishable at a
        // glance. Amber now means only "the aircraft's own motion" on this map.
        // Long dashes are the second cue, so the two never rely on colour alone.
        "line-color": "rgba(52,211,153,0.75)",
        "line-width": 2,
        "line-dasharray": [5, 3],
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }
  if (!map.getLayer(LIVE_SHADOW_TICK_LAYER_ID)) {
    map.addLayer({
      id: LIVE_SHADOW_TICK_LAYER_ID,
      type: "symbol",
      source: LIVE_SHADOW_PATH_SOURCE,
      filter: ["==", ["get", "kind"], "tick"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 10,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-offset": [0, 0.9],
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#a7f3d0", // emerald-200 — reads as part of the line
        "text-halo-color": "#0f172a",
        "text-halo-width": 1.1,
      },
    });
  }
  if (!map.getLayer(LIVE_SHADOW_TOLERANCE_LAYER_ID)) {
    map.addLayer({
      id: LIVE_SHADOW_TOLERANCE_LAYER_ID,
      type: "fill",
      source: LIVE_SHADOW_SOURCE,
      filter: ["==", ["get", "kind"], "tolerance"],
      paint: {
        "fill-color": "rgba(52,211,153,0.35)", // emerald-400 — where to stand
        "fill-outline-color": "rgba(52,211,153,0.9)",
      },
    });
  }
  if (!map.getLayer(LIVE_SHADOW_POINT_LAYER_ID)) {
    map.addLayer({
      id: LIVE_SHADOW_POINT_LAYER_ID,
      type: "circle",
      source: LIVE_SHADOW_SOURCE,
      filter: ["==", ["get", "kind"], "spot"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#34d399",
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.85)",
      },
    });
  }
}

export function useSelectedFlightShadowTrack(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number,
  a: {
    observer: GroundObserver;
    selectedFlightId: string | null;
    flights: readonly FlightState[];
    nowMs: number;
    /** Off by default — this is an extra reading of the map, not a default one. */
    enabled: boolean;
  }
): void {
  const { observer, selectedFlightId, flights, nowMs, enabled } = a;

  const selected = useMemo(
    () => (selectedFlightId ? (flights.find((f) => f.id === selectedFlightId) ?? null) : null),
    [flights, selectedFlightId]
  );
  const bucketedNowMs = Math.floor(nowMs / RECOMPUTE_BUCKET_MS) * RECOMPUTE_BUCKET_MS;

  const track: LiveShadowTrack | null = useMemo(() => {
    if (!enabled || !selected) return null;
    return buildLiveShadowTrack({
      flight: selected,
      nowMs: bucketedNowMs,
      groundHeightMeters: observer.groundHeightMeters,
    });
    // `observer.groundHeightMeters` is the only observer field the solve uses —
    // the whole point is that the spot does not depend on where you stand now.
  }, [enabled, selected, bucketedNowMs, observer.groundHeightMeters]);

  useEffect(() => {
    if (mapReadyTick === 0) return;
    const map = mapRef.current;
    if (!map) return;
    ensureLayers(map);
    const pack = buildLiveShadowFeatures(track);
    (map.getSource(LIVE_SHADOW_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(
      pack.spot
    );
    (map.getSource(LIVE_SHADOW_PATH_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(
      pack.path
    );
  }, [mapRef, mapReadyTick, track]);
}
