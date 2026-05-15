import { geoBoundsFromMapbox } from "@/lib/map/geoBoundsFromMapbox";
import { fieldPerfRecord, fieldPerfTime, isFieldPerfEnabled } from "@/lib/perf/fieldPerf";
import { ROUTES_SOURCE } from "@/lib/map/mapSourceIds";
import { createObserverMarkerElement } from "@/lib/map/observerMarkerElement";
import { queryTerrainElevationMeters } from "@/lib/map/mapboxTerrainElevation";
import { registerMoonTransitLayers } from "@/lib/map/registerMoonTransitLayers";
import type { IFlightProvider } from "@/types";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import mapboxgl from "mapbox-gl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const LIVE_AUTO_REFRESH_MS = 12_000;

function scheduleObserverGroundHeightFromTerrain(
  map: mapboxgl.Map,
  lat: number,
  lng: number
): void {
  const stamp = { lat, lng };
  const apply = () => {
    const s = useObserverStore.getState();
    if (s.observerLocationLocked) {
      return;
    }
    if (s.observer.lat !== stamp.lat || s.observer.lng !== stamp.lng) {
      return;
    }
    const h = queryTerrainElevationMeters(map, lng, lat);
    if (h != null) {
      s.setObserver({ groundHeightMeters: h });
    }
  };
  apply();
  map.once("idle", apply);
}

export type UseMoonTransitMapOptions = {
  flightProvider: IFlightProvider;
  isGolden: boolean;
};

export type UseMoonTransitMapResult = {
  /** `false` ako nema tokena — karta se ne kreira. */
  hasMapboxToken: boolean;
  elRef: RefObject<HTMLDivElement | null>;
  mapRef: RefObject<mapboxgl.Map | null>;
  mapReadyTick: number;
  /** Odmah ponovno učitaj letove za trenutne granice (bez debouncea) — npr. gumb na kartici odabranog leta. */
  refreshFlightsNow: () => void;
};

/**
 * Mapbox instanca, granice/letovi pri `moveend`, marker promatrača (DOM,
 * golden crosshair, lock ring, flyTo na fokus).
 */
export function useMoonTransitMap(
  options: UseMoonTransitMapOptions
): UseMoonTransitMapResult {
  const { flightProvider, isGolden } = options;
  const observer = useObserverStore((s) => s.observer);
  const observerLocationLocked = useObserverStore(
    (s) => s.observerLocationLocked
  );
  const mapFocusNonce = useObserverStore((s) => s.mapFocusNonce);
  const placeObserverFromViewNonce = useObserverStore(
    (s) => s.placeObserverFromViewNonce
  );
  const terrainGroundHeightSyncNonce = useObserverStore(
    (s) => s.terrainGroundHeightSyncNonce
  );
  const setObserverFromMapView = useObserverStore(
    (s) => s.setObserverFromMapView
  );
  const setObserver = useObserverStore((s) => s.setObserver);

  const loadFlights = useRef(useMoonTransitStore.getState().loadFlightsInBounds);
  const setMapViewState = useRef(useMoonTransitStore.getState().setMapView);
  const providerRef = useRef(flightProvider);
  useLayoutEffect(() => {
    providerRef.current = flightProvider;
  }, [flightProvider]);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    const s = useMoonTransitStore;
    loadFlights.current = s.getState().loadFlightsInBounds;
    setMapViewState.current = s.getState().setMapView;
  });

  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReadyTick, setMapReadyTick] = useState(0);
  const boundsRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const flushFlightLoadForMapBounds = useCallback((m: mapboxgl.Map) => {
    fieldPerfTime("map:boundsRefresh", () => {
      const b = m.getBounds();
      if (!b) {
        return;
      }
      const bounds = geoBoundsFromMapbox(b);
      void loadFlights.current(bounds);

      const routeSrc = m.getSource(ROUTES_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (routeSrc) {
        const lines = providerRef.current.getRouteLineFeatures?.(bounds) ?? [];
        routeSrc.setData({
          type: "FeatureCollection",
          features: [...lines],
        });
      }
    });
  }, []);

  const refreshFlightsNow = useCallback(() => {
    if (boundsRefreshDebounceRef.current != null) {
      clearTimeout(boundsRefreshDebounceRef.current);
      boundsRefreshDebounceRef.current = null;
    }
    const m = mapRef.current;
    if (!m || !m.getStyle()) {
      return;
    }
    flushFlightLoadForMapBounds(m);
  }, [flushFlightLoadForMapBounds]);

  const onBoundsRefresh = useCallback(() => {
    const run = () => {
      const m = mapRef.current;
      if (!m) {
        return;
      }
      flushFlightLoadForMapBounds(m);
    };

    const st0 = useMoonTransitStore.getState();
    const debouncedProvider =
      st0.flightProvider === "opensky" || st0.flightProvider === "adsbone";
    if (!debouncedProvider) {
      run();
      return;
    }
    if (boundsRefreshDebounceRef.current != null) {
      clearTimeout(boundsRefreshDebounceRef.current);
    }
    const delayMs = (() => {
      const st = useMoonTransitStore.getState();
      const dualLive =
        (st.flightProvider === "opensky" || st.flightProvider === "adsbone") &&
        st.liveFlightFeeds.opensky &&
        st.liveFlightFeeds.adsbone;
      if (dualLive) {
        return st.selectedFlightId != null ? 1800 : 1400;
      }
      if (st.flightProvider === "opensky") {
        return st.selectedFlightId != null ? 1200 : 800;
      }
      if (st.flightProvider === "adsbone") {
        return st.selectedFlightId != null ? 1600 : 1200;
      }
      return 0;
    })();
    boundsRefreshDebounceRef.current = setTimeout(() => {
      boundsRefreshDebounceRef.current = null;
      run();
    }, delayMs);
  }, [flushFlightLoadForMapBounds]);

  const onMoveSettled = useCallback(
    (map: mapboxgl.Map) => {
      const c = map.getCenter();
      setMapViewState.current({
        center: { lng: c.lng, lat: c.lat },
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      });
      onBoundsRefresh();
    },
    [onBoundsRefresh]
  );

  const flightProviderId = useMoonTransitStore((s) => s.flightProvider);
  const liveFlightFeedsKey = useMoonTransitStore(
    (s) =>
      `${s.liveFlightFeeds.opensky ? 1 : 0}${s.liveFlightFeeds.adsbone ? 1 : 0}`
  );
  useEffect(() => {
    onBoundsRefresh();
  }, [flightProviderId, liveFlightFeedsKey, onBoundsRefresh, mapReadyTick]);

  useEffect(() => {
    onBoundsRefresh();
  }, [observer.lat, observer.lng, onBoundsRefresh, mapReadyTick]);

  useEffect(() => {
    const isLiveProvider =
      flightProviderId === "opensky" || flightProviderId === "adsbone";
    if (!isLiveProvider || mapReadyTick <= 0) {
      return;
    }
    const id = setInterval(() => {
      refreshFlightsNow();
    }, LIVE_AUTO_REFRESH_MS);
    return () => {
      clearInterval(id);
    };
  }, [flightProviderId, mapReadyTick, refreshFlightsNow]);

  const applyPlaceObserverFromMapCenter = useCallback(() => {
    const m = mapRef.current;
    if (!m) {
      return;
    }
    const c = m.getCenter();
    setObserverFromMapView({ lat: c.lat, lng: c.lng });
    scheduleObserverGroundHeightFromTerrain(m, c.lat, c.lng);
  }, [setObserverFromMapView]);

  useEffect(() => {
    if (placeObserverFromViewNonce === 0) {
      return;
    }
    applyPlaceObserverFromMapCenter();
  }, [placeObserverFromViewNonce, mapReadyTick, applyPlaceObserverFromMapCenter]);

  useEffect(() => {
    if (terrainGroundHeightSyncNonce === 0) {
      return;
    }
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) {
      return;
    }
    const o = useObserverStore.getState().observer;
    scheduleObserverGroundHeightFromTerrain(m, o.lat, o.lng);
  }, [terrainGroundHeightSyncNonce, mapReadyTick]);

  useEffect(() => {
    if (!elRef.current || !MAPBOX_TOKEN) {
      return;
    }
    const initial = useMoonTransitStore.getState().mapView;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: elRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [initial.center.lng, initial.center.lat],
      zoom: initial.zoom,
      pitch: initial.pitch,
      bearing: initial.bearing,
      /** Default pitch is 0° in `defaultMapViewState`; Mapbox right-drag / rotate+tilt behaviour stays enabled. */
      pitchWithRotate: true,
      touchPitch: true,
      maxPitch: 78,
    });
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "bottom-right"
    );
    mapRef.current = map;
    const obs = useObserverStore.getState().observer;
    const mark = new mapboxgl.Marker({
      element: createObserverMarkerElement(),
      anchor: "center",
      draggable: !useObserverStore.getState().observerLocationLocked,
    })
      .setLngLat([obs.lng, obs.lat])
      .addTo(map);
    markerRef.current = mark;
    mark.on("dragend", () => {
      const pos = mark.getLngLat();
      setObserver({ lat: pos.lat, lng: pos.lng });
      scheduleObserverGroundHeightFromTerrain(map, pos.lat, pos.lng);
    });

    const settled = () => onMoveSettled(map);

    map.on("load", () => {
      registerMoonTransitLayers(map, () => {
        settled();
        const obs = useObserverStore.getState().observer;
        scheduleObserverGroundHeightFromTerrain(map, obs.lat, obs.lng);
        setMapReadyTick((n) => n + 1);
      });
    });
    map.on("moveend", () => {
      onMoveSettled(map);
      if (isFieldPerfEnabled()) {
        const t0 = performance.now();
        map.once("idle", () => {
          fieldPerfRecord("map:moveendToIdle", performance.now() - t0);
        });
      }
    });
    return () => {
      if (boundsRefreshDebounceRef.current != null) {
        clearTimeout(boundsRefreshDebounceRef.current);
        boundsRefreshDebounceRef.current = null;
      }
      markerRef.current = null;
      mark.remove();
      mapRef.current = null;
      setMapReadyTick(0);
      map.remove();
    };
  }, [onMoveSettled, setObserver]);

  useEffect(() => {
    const m = markerRef.current;
    if (!m) {
      return;
    }
    const wrap = m.getElement();
    const disc = wrap?.querySelector<HTMLDivElement>("div");
    if (!disc) {
      return;
    }
    if (isGolden) {
      disc.classList.add("relative");
      if (!disc.querySelector("[data-transit-sight]")) {
        const v = document.createElement("div");
        v.setAttribute("data-transit-sight", "");
        v.setAttribute("aria-hidden", "true");
        v.className =
          "pointer-events-none absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-yellow-400/90 shadow-[0_0_3px_rgba(59,130,246,0.6)]";
        const h = document.createElement("div");
        h.setAttribute("data-transit-sight", "");
        h.setAttribute("aria-hidden", "true");
        h.className =
          "pointer-events-none absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-yellow-400/90 shadow-[0_0_3px_rgba(59,130,246,0.6)]";
        disc.appendChild(v);
        disc.appendChild(h);
      }
    } else {
      disc
        .querySelectorAll("[data-transit-sight]")
        .forEach((n) => n.remove());
      disc.classList.remove("relative");
    }
  }, [isGolden]);

  useEffect(() => {
    const m = markerRef.current;
    if (!m) {
      return;
    }
    m.setDraggable(!observerLocationLocked);
    const disc = m.getElement()?.querySelector<HTMLDivElement>("div");
    if (!disc) {
      return;
    }
    if (observerLocationLocked) {
      disc.classList.add("ring-2", "ring-blue-500/50");
      disc.classList.remove("cursor-grab", "active:cursor-grabbing");
    } else {
      disc.classList.remove("ring-2", "ring-blue-500/50");
      disc.classList.add("cursor-grab", "active:cursor-grabbing");
    }
  }, [observerLocationLocked]);

  useEffect(() => {
    markerRef.current?.setLngLat([observer.lng, observer.lat]);
  }, [observer.lat, observer.lng]);

  useEffect(() => {
    if (mapFocusNonce === 0) {
      return;
    }
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const doFly = () => {
      if (!map.getStyle() || !map.isStyleLoaded()) {
        return;
      }
      const c = useObserverStore.getState().observer;
      const z = map.getZoom();
      map.flyTo({
        center: [c.lng, c.lat],
        zoom: z < 10.5 ? 10.5 : z,
        essential: true,
      });
    };
    if (map.isStyleLoaded()) {
      doFly();
    } else {
      map.once("load", doFly);
    }
  }, [mapFocusNonce, mapReadyTick]);

  return {
    hasMapboxToken: Boolean(MAPBOX_TOKEN),
    elRef,
    mapRef,
    mapReadyTick,
    refreshFlightsNow,
  };
}
