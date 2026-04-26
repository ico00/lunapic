"use client";

import { SelectedAircraftPopupContent } from "@/components/map/SelectedAircraftPopupContent";
import { useExtrapolatedFlightsForMap } from "@/hooks/useExtrapolatedFlightsForMap";
import {
  SELECTED_AIRCRAFT_POPUP_SCREEN_X,
  SELECTED_AIRCRAFT_POPUP_SCREEN_Y,
} from "@/lib/map/selectedAircraftPopupAnchor";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import mapboxgl from "mapbox-gl";
import type { Map } from "mapbox-gl";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";

function schedulePopupTeardown(args: {
  map: Map | null;
  onMapMove: () => void;
  root: Root | null;
  popup: mapboxgl.Popup | null;
}): void {
  const { map, onMapMove, root, popup } = args;
  queueMicrotask(() => {
    if (map) {
      map.off("move", onMapMove);
    }
    root?.unmount();
    popup?.remove();
  });
}

type SelectedAircraftMapPopupProps = {
  mapRef: RefObject<Map | null>;
  mapReadyTick: number;
};

/**
 * Mapbox {@link mapboxgl.Popup} ispod weather chipa (fiksna zaslonska točka → `unproject`).
 */
export function SelectedAircraftMapPopup({
  mapRef,
  mapReadyTick,
}: SelectedAircraftMapPopupProps) {
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const setSelectedFlightId = useMoonTransitStore(
    (s) => s.setSelectedFlightId
  );
  const storeFlights = useMoonTransitStore((s) => s.flights);
  const mapFlights = useExtrapolatedFlightsForMap();

  const flight =
    selectedFlightId == null
      ? null
      : mapFlights.find((f) => f.id === selectedFlightId) ??
        storeFlights.find((f) => f.id === selectedFlightId) ??
        null;

  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const rootRef = useRef<Root | null>(null);
  /** Mapa na kojoj je registriran `move` listener. */
  const moveListenerMapRef = useRef<Map | null>(null);

  const reposition = useCallback(() => {
    const map = mapRef.current;
    const popup = popupRef.current;
    if (!map?.getStyle() || !popup) {
      return;
    }
    popup.setLngLat(
      map.unproject([
        SELECTED_AIRCRAFT_POPUP_SCREEN_X,
        SELECTED_AIRCRAFT_POPUP_SCREEN_Y,
      ])
    );
  }, [mapRef]);

  const repositionLatest = useRef(reposition);

  useEffect(() => {
    repositionLatest.current = reposition;
  }, [reposition]);

  /** Stabilan za Mapbox `on`/`off` — izbjegava cleanup na svaku promjenu `reposition`. */
  const onMapMove = useCallback(() => {
    repositionLatest.current();
  }, []);

  useEffect(() => {
    if (selectedFlightId != null) {
      return;
    }
    const m = moveListenerMapRef.current;
    const root = rootRef.current;
    const popup = popupRef.current;
    moveListenerMapRef.current = null;
    rootRef.current = null;
    popupRef.current = null;
    schedulePopupTeardown({ map: m, onMapMove, root, popup });
  }, [selectedFlightId, onMapMove]);

  useEffect(() => {
    if (selectedFlightId == null) {
      return;
    }
    const map = mapRef.current;
    if (!map?.getStyle()) {
      return;
    }

    if (!popupRef.current) {
      const el = document.createElement("div");
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: "none",
        className: "moon-transit-aircraft-popup",
        anchor: "top-left",
      })
        .setDOMContent(el)
        .addTo(map);
      rootRef.current = createRoot(el);
      map.on("move", onMapMove);
      moveListenerMapRef.current = map;
    }

    reposition();
  }, [selectedFlightId, mapReadyTick, mapRef, onMapMove, reposition]);

  useEffect(() => {
    if (selectedFlightId == null || !rootRef.current) {
      return;
    }
    rootRef.current.render(
      <SelectedAircraftPopupContent
        flight={flight}
        onDismiss={() => setSelectedFlightId(null)}
      />
    );
  }, [flight, selectedFlightId, setSelectedFlightId]);

  useEffect(() => {
    return () => {
      const m = moveListenerMapRef.current;
      const root = rootRef.current;
      const popup = popupRef.current;
      moveListenerMapRef.current = null;
      rootRef.current = null;
      popupRef.current = null;
      schedulePopupTeardown({ map: m, onMapMove, root, popup });
    };
  }, [onMapMove]);

  return null;
}
