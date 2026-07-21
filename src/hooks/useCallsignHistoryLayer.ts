/**
 * Renders two Mapbox layers for a selected callsign from the Flight log panel:
 *   - Individual session lines (thin, semi-transparent) — natural heat corridor
 *     through overlap
 *   - Mean path (bright centre line) — spatial-bin average across all sessions
 *
 * Watches `flightLogSelectedCallsign` + `flightLogDaysBack` from the store.
 * Clears both layers when no callsign is selected.
 */

import {
  CALLSIGN_SESSIONS_SOURCE,
  CALLSIGN_SESSIONS_LAYER_ID,
  CALLSIGN_MEAN_SOURCE,
  CALLSIGN_MEAN_LAYER_ID,
} from "@/lib/map/mapSourceIds";
import { appPath } from "@/lib/paths/appPath";
import { fitGeoJsonBounds } from "@/lib/map/fitGeoJsonBounds";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type mapboxgl from "mapbox-gl";
import { useEffect, useRef, type RefObject } from "react";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function ensureSource(map: mapboxgl.Map, id: string) {
  if (!map.getSource(id)) {
    map.addSource(id, { type: "geojson", data: EMPTY_FC });
  }
}

function ensureSessionsLayer(map: mapboxgl.Map) {
  if (map.getLayer(CALLSIGN_SESSIONS_LAYER_ID)) return;
  ensureSource(map, CALLSIGN_SESSIONS_SOURCE);
  map.addLayer({
    id: CALLSIGN_SESSIONS_LAYER_ID,
    type: "line",
    source: CALLSIGN_SESSIONS_SOURCE,
    paint: {
      "line-color": "rgba(56,189,248,0.5)",   // sky-400 at 50 %
      "line-width": 1.8,
      "line-blur": 0.4,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
}

function ensureMeanLayer(map: mapboxgl.Map) {
  if (map.getLayer(CALLSIGN_MEAN_LAYER_ID)) return;
  ensureSource(map, CALLSIGN_MEAN_SOURCE);
  // Glow: wide soft pass behind the crisp centre line
  map.addLayer({
    id: `${CALLSIGN_MEAN_LAYER_ID}-glow`,
    type: "line",
    source: CALLSIGN_MEAN_SOURCE,
    paint: {
      "line-color": "rgba(125,211,252,0.35)",
      "line-width": 7,
      "line-blur": 4,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: CALLSIGN_MEAN_LAYER_ID,
    type: "line",
    source: CALLSIGN_MEAN_SOURCE,
    paint: {
      "line-color": "rgba(186,230,253,0.92)",  // sky-200 at 92 %
      "line-width": 2.2,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
}

function clearLayers(map: mapboxgl.Map) {
  const src1 = map.getSource(CALLSIGN_SESSIONS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  src1?.setData(EMPTY_FC);
  const src2 = map.getSource(CALLSIGN_MEAN_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  src2?.setData(EMPTY_FC);
}

export function useCallsignHistoryLayer(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number
): void {
  const callsign = useMoonTransitStore((s) => s.flightLogSelectedCallsign);
  const daysBack = useMoonTransitStore((s) => s.flightLogDaysBack);
  const setNextPass = useMoonTransitStore((s) => s.setFlightLogNextPass);
  const setAltitude = useMoonTransitStore((s) => s.setFlightLogAltitude);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (mapReadyTick === 0) return;
    const map = mapRef.current;
    if (!map) return;

    abortRef.current?.abort();
    abortRef.current = null;

    ensureSessionsLayer(map);
    ensureMeanLayer(map);

    if (!callsign) {
      clearLayers(map);
      setNextPass(null);
      setAltitude(null);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const params = new URLSearchParams({
      callsign,
      days: String(daysBack),
    });

    fetch(appPath(`/api/flight-log/callsign-analysis?${params}`), {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`callsign-analysis ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (ctrl.signal.aborted) return;
        const src1 = map.getSource(CALLSIGN_SESSIONS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
        src1?.setData(data.sessions as Parameters<typeof src1.setData>[0]);
        const src2 = map.getSource(CALLSIGN_MEAN_SOURCE) as mapboxgl.GeoJSONSource | undefined;
        src2?.setData(data.mean as Parameters<typeof src2.setData>[0]);
        // Bring the route into view — layers render at their real location, which
        // may be outside the current viewport. Fit to all session lines.
        fitGeoJsonBounds(map, data.sessions ?? data.mean);
        const np = data.nextPass as {
          estimateMs: number; stdMinutes: number; sessionCount: number;
        } | null | undefined;
        setNextPass(
          np
            ? { callsign, estimateMs: np.estimateMs, stdMinutes: np.stdMinutes, sessionCount: np.sessionCount }
            : null
        );
        const alt = data.altitude as { minM: number; medianM: number; maxM: number } | null | undefined;
        setAltitude(alt ? { callsign, ...alt } : null);
      })
      .catch(() => {
        // Abort or error — leave layers empty
      });

    return () => { ctrl.abort(); };
  }, [callsign, daysBack, mapReadyTick, mapRef, setNextPass, setAltitude]);
}
