"use client";

import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import { AstroService } from "@/lib/domain/astro/astroService";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import type { IFlightProvider } from "@/types";
import type { GeoBounds } from "@/types/geo";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import mapboxgl from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

const FLIGHTS_SOURCE = "flights-geo";
const ROUTES_SOURCE = "routes-geo";
const MOON_AZ_SOURCE = "moon-azimuth-geo";
const MOON_INT_SOURCE = "moon-intersections-geo";
const GROUND_OPTIMAL_SOURCE = "optimal-ground-geo";
const MOON_PATH_SOURCE = "moon-path-geo";
const MOON_PATH_LABELS_SOURCE = "moon-path-labels-geo";
/** Dužina “zraka” azimuta na karti (m) — dovoljno za presjek s koreidorima. */
const MOON_AZ_LENGTH_M = 1_200_000;
/**
 * Kraći zrak za 12h moon path: vrhovi su na ~ovoj udaljenosti od promatrača.
 * Uz 1,2 Mm cijela polylinija približno 24 točke bila bi stotine km daleko od zumiranog okvira,
 * pa se na karti vidi samo trenutni mjesin zrak (jedna duga linija).
 */
const MOON_PATH_RAY_LENGTH_M = 200_000;
const CRUISE_FL_M = 10_000;
/** Polovica „tlocrtne staze” isprekidane trake. */
const OPTIMAL_GROUND_HALF_M = 4_000;
const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function boundsFromMap(
  b: mapboxgl.LngLatBounds
): GeoBounds {
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng };
}

function createPhotoMarkerElement(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "Observer (fixed shooting point)");
  wrap.className =
    "flex h-12 w-12 -translate-x-1/2 items-end justify-center pb-0.5";
  const disc = document.createElement("div");
  disc.className =
    "flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-400 bg-zinc-900 text-lg shadow-lg shadow-amber-500/30";
  disc.textContent = "📷";
  wrap.appendChild(disc);
  return wrap;
}

export type MapContainerProps = {
  flightProvider: IFlightProvider;
  /** Žuta = plava u okviru 0,1° — nisan na markeru, bljesak u roditelju. */
  isGolden?: boolean;
};

export function MapContainer({ flightProvider, isGolden = false }: MapContainerProps) {
  const rawFlights = useMoonTransitStore((s) => s.flights);
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const [wallNow, setWallNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => {
      setWallNow(Date.now());
    }, 200);
    return () => {
      clearInterval(i);
    };
  }, []);
  const flights = useMemo(
    () =>
      rawFlights.map((f) => extrapolateFlightForDisplay(f, wallNow, latencySkewMs)),
    [rawFlights, wallNow, latencySkewMs]
  );
  const observer = useObserverStore((s) => s.observer);
  const observerLocationLocked = useObserverStore(
    (s) => s.observerLocationLocked
  );
  const mapFocusNonce = useObserverStore((s) => s.mapFocusNonce);
  const setObserverFromMapView = useObserverStore(
    (s) => s.setObserverFromMapView
  );
  const requestFocusOnObserver = useObserverStore(
    (s) => s.requestFocusOnObserver
  );
  const moon = useMoonStateComputed();
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);

  const moonPathPack = useMemo(() => {
    const obs = { lat: observer.lat, lng: observer.lng };
    const samples = AstroService.getMoonPathSamples(
      referenceEpochMs,
      obs.lat,
      obs.lng
    );
    const lineCoords = GeometryEngine.buildMoonPathLineCoordinates(
      obs,
      samples,
      MOON_PATH_RAY_LENGTH_M
    );
    const lineFeature =
      lineCoords.length >= 2
        ? {
            type: "Feature" as const,
            properties: { kind: "moon-path" },
            geometry: {
              type: "LineString" as const,
              coordinates: lineCoords,
            },
          }
        : null;

    const labelHours = [0, 2, 4, 6, 8, 10, 12] as const;
    const labelFeatures = labelHours.map((h) => {
      const t = referenceEpochMs + h * 3_600_000;
      const m = AstroService.getMoonState(new Date(t), obs.lat, obs.lng);
      const [, end] = GeometryEngine.buildMoonAzimuthLine(
        obs,
        m,
        MOON_PATH_RAY_LENGTH_M
      );
      const label = `${new Date(t).getHours().toString().padStart(2, "0")}h`;
      return {
        type: "Feature" as const,
        properties: { label, key: `mph-${h}` },
        geometry: {
          type: "Point" as const,
          coordinates: [end.lng, end.lat],
        },
      };
    });

    return { lineFeature, labelFeatures };
  }, [referenceEpochMs, observer.lat, observer.lng]);

  const moonAzFeature = useMemo(() => {
    const [a, b] = GeometryEngine.buildMoonAzimuthLine(
      { lat: observer.lat, lng: observer.lng },
      moon,
      MOON_AZ_LENGTH_M
    );
    return {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
      },
      properties: { kind: "moon-azimuth" },
    };
  }, [observer.lat, observer.lng, moon]);

  const intersectionFeatures = useMemo(() => {
    const hits = GeometryEngine.intersectMoonAzimuthWithStaticRoutes(
      { lat: observer.lat, lng: observer.lng },
      moon,
      CRUISE_FL_M
    );
    return hits.map((h) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [h.point.lng, h.point.lat],
      },
      properties: {
        routeId: h.routeId,
        label: h.label,
        key: `${h.routeId}-${h.point.lng}-${h.point.lat}`,
      },
    }));
  }, [observer.lat, observer.lng, moon]);

  const optimalGroundFeatures = useMemo(
    () =>
      GeometryEngine.buildOptimalGroundPathFeatures(
        { lat: observer.lat, lng: observer.lng },
        moon,
        CRUISE_FL_M,
        OPTIMAL_GROUND_HALF_M
      ),
    [observer.lat, observer.lng, moon]
  );
  const loadFlights = useRef(useMoonTransitStore.getState().loadFlightsInBounds);
  const setMapViewState = useRef(useMoonTransitStore.getState().setMapView);
  const providerRef = useRef(flightProvider);
  providerRef.current = flightProvider;
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    const s = useMoonTransitStore;
    loadFlights.current = s.getState().loadFlightsInBounds;
    setMapViewState.current = s.getState().setMapView;
  });

  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReadyTick, setMapReadyTick] = useState(0);

  const onBoundsRefresh = useCallback(() => {
    const m = mapRef.current;
    if (!m) {
      return;
    }
    const b = m.getBounds();
    if (!b) {
      return;
    }
    const bounds = boundsFromMap(b);
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
  }, []);

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
  useEffect(() => {
    onBoundsRefresh();
  }, [flightProviderId, onBoundsRefresh, mapReadyTick]);

  const placeObserverHere = useCallback(() => {
    const m = mapRef.current;
    if (!m) {
      return;
    }
    const c = m.getCenter();
    setObserverFromMapView({ lat: c.lat, lng: c.lng });
  }, [setObserverFromMapView]);

  const focusMapOnObserver = useCallback(() => {
    requestFocusOnObserver();
  }, [requestFocusOnObserver]);

  useEffect(() => {
    if (!elRef.current || !token) {
      return;
    }
    const initial = useMoonTransitStore.getState().mapView;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: elRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [initial.center.lng, initial.center.lat],
      zoom: initial.zoom,
      pitch: initial.pitch,
      bearing: initial.bearing,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;
    const obs = useObserverStore.getState().observer;
    const mark = new mapboxgl.Marker({
      element: createPhotoMarkerElement(),
      anchor: "bottom",
    })
      .setLngLat([obs.lng, obs.lat])
      .addTo(map);
    markerRef.current = mark;

    const settled = () => onMoveSettled(map);

    map.on("load", () => {
      map.addSource(ROUTES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: ROUTES_SOURCE,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#a78bfa",
          "line-width": 2.5,
          "line-opacity": 0.4,
        },
      });
      map.addSource(GROUND_OPTIMAL_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "optimal-ground-line",
        type: "line",
        source: GROUND_OPTIMAL_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#c4b5fd",
          "line-width": 1.1,
          "line-opacity": 0.4,
          "line-dasharray": [1.1, 1.3],
        },
      });

      map.addSource(MOON_PATH_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addSource(MOON_AZ_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "moon-az-glow",
        type: "line",
        source: MOON_AZ_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#fef08a",
          "line-width": 10,
          "line-blur": 3.5,
          "line-opacity": 0.24,
        },
      });
      map.addLayer({
        id: "moon-az-core",
        type: "line",
        source: MOON_AZ_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#fffbeb",
          "line-width": 1.4,
          "line-opacity": 0.95,
        },
      });

      map.addSource(MOON_PATH_LABELS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addSource(FLIGHTS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "flights-layer",
        type: "circle",
        source: FLIGHTS_SOURCE,
        paint: {
          "circle-radius": 6,
          "circle-color": "#38bdf8",
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1,
        },
      });

      map.addSource(MOON_INT_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "moon-intersections",
        type: "circle",
        source: MOON_INT_SOURCE,
        paint: {
          "circle-radius": 6,
          "circle-color": "#facc15",
          "circle-stroke-color": "#1c1917",
          "circle-stroke-width": 2,
          "circle-opacity": 0.95,
        },
      });

      map.addLayer({
        id: "moon-path-line",
        type: "line",
        source: MOON_PATH_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 2.5,
          "line-opacity": 0.9,
          "line-dasharray": [1.2, 1.8],
        },
      });
      map.addLayer({
        id: "moon-path-labels",
        type: "symbol",
        source: MOON_PATH_LABELS_SOURCE,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 15,
          "text-font": [
            "Open Sans Semibold",
            "Arial Unicode MS Bold",
          ],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#fbbf24",
          "text-halo-color": "#18181b",
          "text-halo-width": 1.1,
        },
      });
      settled();
      setMapReadyTick((n) => n + 1);
    });
    map.on("moveend", () => onMoveSettled(map));
    return () => {
      markerRef.current = null;
      mark.remove();
      mapRef.current = null;
      setMapReadyTick(0);
      map.remove();
    };
  }, [onMoveSettled]);

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
          "pointer-events-none absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-emerald-300/90 shadow-[0_0_2px_#6ee7b7]";
        const h = document.createElement("div");
        h.setAttribute("data-transit-sight", "");
        h.setAttribute("aria-hidden", "true");
        h.className =
          "pointer-events-none absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-emerald-300/90 shadow-[0_0_2px_#6ee7b7]";
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
    const disc = m.getElement()?.querySelector<HTMLDivElement>("div");
    if (!disc) {
      return;
    }
    if (observerLocationLocked) {
      disc.classList.add("ring-2", "ring-rose-500/60");
    } else {
      disc.classList.remove("ring-2", "ring-rose-500/60");
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(MOON_AZ_SOURCE)) {
      return;
    }
    (map.getSource(MOON_AZ_SOURCE) as mapboxgl.GeoJSONSource).setData(
      moonAzFeature
    );
    (map.getSource(MOON_INT_SOURCE) as mapboxgl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: intersectionFeatures,
    });
    const og = map.getSource(GROUND_OPTIMAL_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (og) {
      og.setData({
        type: "FeatureCollection",
        features: [...optimalGroundFeatures],
      });
    }
  }, [intersectionFeatures, moonAzFeature, optimalGroundFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(MOON_PATH_SOURCE)) {
      return;
    }
    (map.getSource(MOON_PATH_SOURCE) as mapboxgl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: moonPathPack.lineFeature ? [moonPathPack.lineFeature] : [],
    });
    (map.getSource(MOON_PATH_LABELS_SOURCE) as mapboxgl.GeoJSONSource).setData(
      {
        type: "FeatureCollection",
        features: moonPathPack.labelFeatures,
      }
    );
  }, [moonPathPack, mapReadyTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(FLIGHTS_SOURCE)) {
      return;
    }
    const src = map.getSource(FLIGHTS_SOURCE) as mapboxgl.GeoJSONSource;
    src.setData({
      type: "FeatureCollection",
      features: flights.map((f) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [f.position.lng, f.position.lat],
        },
        properties: { id: f.id, name: f.callSign ?? f.id },
      })),
    });
  }, [flights]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(ROUTES_SOURCE)) {
      return;
    }
    const b = map.getBounds();
    if (!b) {
      return;
    }
    const bounds = boundsFromMap(b);
    const routeSrc = map.getSource(ROUTES_SOURCE) as mapboxgl.GeoJSONSource;
    const lines = flightProvider.getRouteLineFeatures?.(bounds) ?? [];
    routeSrc.setData({
      type: "FeatureCollection",
      features: [...lines],
    });
  }, [flightProvider]);

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-900 px-4 text-center text-sm text-amber-200">
        Set <code className="mx-1 rounded bg-zinc-800 px-1.5 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> in
        .env.local
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={elRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end p-3">
        <div className="pointer-events-auto flex max-w-[min(100%,18rem)] flex-col gap-2 self-start rounded-lg border border-zinc-800 bg-zinc-950/90 p-2.5 text-xs shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={placeObserverHere}
            disabled={observerLocationLocked}
            className="rounded border border-amber-700/50 bg-amber-950/40 px-2.5 py-1.5 text-left text-amber-100/90 transition hover:border-amber-500/70 hover:bg-amber-950/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Set my location here
            <span className="mt-0.5 block font-normal text-[0.7rem] text-zinc-500">
              {observerLocationLocked
                ? "location locked"
                : "current view center → observer"}
            </span>
          </button>
          <button
            type="button"
            onClick={focusMapOnObserver}
            className="rounded border border-zinc-600 bg-zinc-800/60 px-2.5 py-1.5 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Focus on me
            <span className="mt-0.5 block font-normal text-[0.7rem] text-zinc-500">
              pans the map only, does not move the point
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
