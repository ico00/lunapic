/**
 * Fetches the historical position trail for the selected aircraft from the
 * local ADS-B log and renders it on SELECTED_FLIGHT_TRAIL_SOURCE.
 *
 * Only active when the LunaPic ADS-B (localsdr) provider is enabled —
 * other providers don't have a local log to query.
 */

import { SELECTED_FLIGHT_TRAIL_SOURCE } from "@/lib/map/mapSourceIds";
import { appPath } from "@/lib/paths/appPath";
import { fitGeoJsonBounds } from "@/lib/map/fitGeoJsonBounds";
import { smoothTrailGeoJson } from "@/lib/map/smoothPolyline";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type mapboxgl from "mapbox-gl";
import { useEffect, useRef, type RefObject } from "react";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };
const LIVE_HOURS_BACK = 2;
/**
 * Live trag se mora osvježavati dok avion leti — server logira nove pozicije
 * svakih ~15 s, pa bez ponovnog dohvaćanja trag zaostaje i čini se da je
 * tracking stao. Usklađeno s kadencom logiranja: brže osvježavanje samo bi
 * ponovo učitalo iste podatke (read-path učita CIJELU bazu po upitu — skupo).
 */
const LIVE_TRAIL_REFRESH_MS = 15_000;

function clearTrail(map: mapboxgl.Map) {
  const src = map.getSource(SELECTED_FLIGHT_TRAIL_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  src?.setData(EMPTY_FC);
}

export function useSelectedFlightTrail(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number
): void {
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const localsdrActive = useMoonTransitStore((s) => s.liveFlightFeeds.localsdr);
  const flightLogIcao24 = useMoonTransitStore((s) => s.flightLogSelectedIcao24);
  const flightLogDays = useMoonTransitStore((s) => s.flightLogDaysBack);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (mapReadyTick === 0) return;
    const map = mapRef.current;
    if (!map) return;

    abortRef.current?.abort();
    abortRef.current = null;

    // Flight log panel selection takes priority over the live trail.
    if (flightLogIcao24) {
      const hoursBack = Math.min(flightLogDays * 24, 720);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      fetch(appPath(`/api/flight-log/track/${encodeURIComponent(flightLogIcao24)}?hours=${hoursBack}`), {
        cache: "no-store",
        signal: ctrl.signal,
      })
        .then((res) => { if (!res.ok) throw new Error(`track ${res.status}`); return res.json(); })
        .then((data) => {
          if (ctrl.signal.aborted) return;
          const smoothed = smoothTrailGeoJson(data);
          const src = map.getSource(SELECTED_FLIGHT_TRAIL_SOURCE) as mapboxgl.GeoJSONSource | undefined;
          src?.setData(smoothed as Parameters<typeof src.setData>[0]);
          // Panel selection: bring the trail into view (live trail below does not).
          fitGeoJsonBounds(map, smoothed);
        })
        .catch(() => {});
      return () => { ctrl.abort(); };
    }

    if (!localsdrActive || !selectedFlightId) {
      clearTrail(map);
      return;
    }

    // Live trail: fetch immediately, then keep refreshing so it tracks the
    // moving aircraft instead of freezing at the position it had on selection.
    // The read-path loads the whole DB per query, so skip a tick if the previous
    // request is still running — never pile up overlapping heavy reads.
    let cancelled = false;
    let inFlight = false;
    const fetchLiveTrail = () => {
      if (inFlight) return;
      inFlight = true;
      fetch(appPath(`/api/flight-log/track/${encodeURIComponent(selectedFlightId)}?hours=${LIVE_HOURS_BACK}`), {
        cache: "no-store",
      })
        .then((res) => {
          if (!res.ok) throw new Error(`track ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (cancelled) return;
          const src = map.getSource(SELECTED_FLIGHT_TRAIL_SOURCE) as mapboxgl.GeoJSONSource | undefined;
          src?.setData(smoothTrailGeoJson(data) as Parameters<typeof src.setData>[0]);
        })
        .catch(() => {})
        .finally(() => { inFlight = false; });
    };

    fetchLiveTrail();
    const intervalId = setInterval(fetchLiveTrail, LIVE_TRAIL_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [selectedFlightId, localsdrActive, flightLogIcao24, flightLogDays, mapReadyTick, mapRef]);
}
