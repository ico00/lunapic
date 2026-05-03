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

/**
 * Skida listenere odmah; `root.unmount()` / `popup.remove()` u sljedećem microtasku
 * jer i `useEffect` može još biti u istom React commitu kao render koji je koristio taj root.
 */
function destroyAircraftPopupNow(args: {
  map: Map | null;
  onMapMove: () => void;
  root: Root | null;
  popup: mapboxgl.Popup | null;
}): void {
  const { map, onMapMove, root, popup } = args;
  if (map) {
    map.off("move", onMapMove);
    map.off("resize", onMapMove);
  }
  queueMicrotask(() => {
    root?.unmount();
    popup?.remove();
  });
}

/** Isto kao `destroyAircraftPopupNow` (unmount je već odgođen unutra). */
function schedulePopupTeardown(args: {
  map: Map | null;
  onMapMove: () => void;
  root: Root | null;
  popup: mapboxgl.Popup | null;
}): void {
  destroyAircraftPopupNow(args);
}

/** Širina viewporta (suženi browser / mobil) — šira od samog map canvasa kad su devtools otvoreni. */
function mobileViewportWidthPx(): number {
  const w = globalThis.window;
  if (!w) return 0;
  const vw = w.visualViewport?.width;
  if (vw != null && Number.isFinite(vw) && vw > 0) {
    return Math.ceil(vw);
  }
  const iw = w.innerWidth;
  if (Number.isFinite(iw) && iw > 0) {
    return Math.ceil(iw);
  }
  const cw = w.document?.documentElement?.clientWidth;
  if (cw != null && Number.isFinite(cw) && cw > 0) {
    return Math.ceil(cw);
  }
  return 0;
}

/** Match Tailwind `md:` breakpoint used by the shell. */
function isMobileMapWidth(map: Map): boolean {
  return map.getContainer().getBoundingClientRect().width < 768;
}

/**
 * Donji `padding` roditelja Mapbox containera (HomePageClient ostavlja traku za tabove).
 * Pomakne `Popup` s `anchor: bottom` vizualno u rezervu da se kartica spoji s tab trakom.
 */
/** Ako se `padding-bottom` ne može pouzdano očitati s roditelja map canvasa. */
const MOBILE_MAP_DOCK_PADDING_FALLBACK_PX = 88;
/**
 * Sidrište `anchor: bottom`: pikseli iznad donjeg ruba canvasa za `unproject` (**0** = donji rub canvasa).
 */
const MOBILE_POPUP_ANCHOR_ABOVE_MAP_BOTTOM_PX = 0;

function readMobileDockPaddingBottomPx(map: Map): number {
  let best = 0;
  let el: HTMLElement | null = map.getContainer().parentElement;
  for (let hop = 0; hop < 8 && el; hop++) {
    const raw = getComputedStyle(el).paddingBottom;
    const px = Number.parseFloat(raw);
    if (Number.isFinite(px) && px >= 8) {
      best = Math.max(best, Math.round(px));
    }
    el = el.parentElement;
  }
  /** Bez globalnog min(120px): to je diglo karticu predaleko od tabova kad je stvarni padding ~72px. */
  if (best >= 48) {
    return best;
  }
  return MOBILE_MAP_DOCK_PADDING_FALLBACK_PX;
}

function measuredMobilePrimaryNavHeightPx(): number {
  if (typeof document === "undefined") {
    return 0;
  }
  const nav = document.querySelector<HTMLElement>(
    '[data-testid="mobile-primary-nav"]'
  );
  if (!nav) {
    return 0;
  }
  return Math.ceil(nav.getBoundingClientRect().height);
}

/**
 * Pozitivna magnituda (px); u `setOffset` ide kao **negativan** Y za `anchor: bottom` (gore).
 * `base` = shell `padding-bottom` ispod karte — već uključuje traku za tabove; ne zbrajati opet punu
 * visinu nav-a (kartica bi „letjela“ iznad karte).
 */
function mobileBottomPopupLiftMagnitudePx(map: Map): number {
  const base = readMobileDockPaddingBottomPx(map);
  if (!isMobileMapWidth(map)) {
    return base;
  }
  const navH = measuredMobilePrimaryNavHeightPx();
  /** Samo ako je nav stvarno viši od shell paddinga — inače par piksela za Mapbox / zaobljenje. */
  const mismatch =
    navH > 0 && navH > base + 8
      ? Math.round((navH - base) * 0.35)
      : 0;
  return Math.max(0, Math.min(20, 1 + Math.round(base * 0.02) + mismatch));
}

/**
 * Pozitivan Y u {@link mapboxgl.Popup#setOffset} = prema **dolje** (Mapbox). Lagano spušta karticu
 * na vrh tab trake nakon sitnog `-lift` gore.
 */
const MOBILE_POPUP_DOCK_DOWN_NUDGE_PX = 14;

function mobilePopupBottomOffsetY(map: Map): number {
  if (!isMobileMapWidth(map)) {
    return 0;
  }
  const lift = mobileBottomPopupLiftMagnitudePx(map);
  return -lift + MOBILE_POPUP_DOCK_DOWN_NUDGE_PX;
}

/**
 * Screen pixel anchor for `map.unproject` (origin top-left of the map container).
 * Mobile: bottom-centre of map canvas; {@link readMobileDockPaddingBottomPx} + `setOffset`
 * nosač spaja s bottom tab stripom. Desktop: HUD under header (`anchor: top-left`).
 */
function popupScreenAnchor(map: Map): {
  x: number;
  y: number;
  anchor: "top-left" | "bottom";
} {
  const rect = map.getContainer().getBoundingClientRect();
  const mobile = isMobileMapWidth(map);
  if (mobile) {
    const y = Math.max(
      1,
      rect.height - MOBILE_POPUP_ANCHOR_ABOVE_MAP_BOTTOM_PX
    );
    return {
      x: rect.width / 2,
      y,
      anchor: "bottom",
    };
  }
  return {
    x: SELECTED_AIRCRAFT_POPUP_SCREEN_X,
    y: SELECTED_AIRCRAFT_POPUP_SCREEN_Y,
    anchor: "top-left",
  };
}

type SelectedAircraftMapPopupProps = {
  mapRef: RefObject<Map | null>;
  mapReadyTick: number;
  /** Kad je mobilni bottom sheet otvoren — ukloni popup da se ne preklapa s panelom. */
  suppressed?: boolean;
  /** Ponovno učitaj letove za trenutni viewport (bez debouncea). */
  onRefreshFlights?: () => void;
};

/**
 * Mapbox {@link mapboxgl.Popup} ispod weather chipa (fiksna zaslonska točka → `unproject`).
 */
export function SelectedAircraftMapPopup({
  mapRef,
  mapReadyTick,
  suppressed = false,
  onRefreshFlights,
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
    const anchor = popupScreenAnchor(map);
    popup.setLngLat(map.unproject([anchor.x, anchor.y]));
    const popupEl = popup.getElement();
    if (anchor.anchor === "bottom") {
      popup.setOffset([0, mobilePopupBottomOffsetY(map)]);
      if (isMobileMapWidth(map)) {
        const vw = Math.max(mobileViewportWidthPx(), map.getContainer().clientWidth);
        if (vw > 0) {
          popup.setMaxWidth(`${vw}px`);
          popupEl?.style.setProperty("width", `${vw}px`);
          popupEl?.style.setProperty("max-width", `${vw}px`);
        }
      } else {
        popup.setMaxWidth("none");
        popupEl?.style.removeProperty("width");
        popupEl?.style.removeProperty("max-width");
      }
    } else {
      popup.setOffset([0, 0]);
      popup.setMaxWidth("none");
      popupEl?.style.removeProperty("width");
      popupEl?.style.removeProperty("max-width");
    }
  }, [mapRef]);

  const repositionLatest = useRef(reposition);

  useEffect(() => {
    repositionLatest.current = reposition;
  }, [reposition]);

  /** Stabilan za Mapbox `on`/`off` — izbjegava cleanup na svaku promjenu `reposition`. */
  const onMapMove = useCallback(() => {
    repositionLatest.current();
  }, []);

  /**
   * Ukloni popup kad nema prikaza (`suppressed` ili nema odabira).
   * `root.unmount()` ide kroz `queueMicrotask` u {@link destroyAircraftPopupNow} — inače i
   * `useEffect` može pogoditi isti React commit kao `root.render()` pa React javlja sinkroni unmount.
   */
  useEffect(() => {
    const shouldShow = selectedFlightId != null && !suppressed;
    if (shouldShow) {
      return;
    }
    const m = moveListenerMapRef.current;
    const root = rootRef.current;
    const popup = popupRef.current;
    moveListenerMapRef.current = null;
    rootRef.current = null;
    popupRef.current = null;
    destroyAircraftPopupNow({ map: m ?? null, onMapMove, root, popup });
  }, [selectedFlightId, suppressed, onMapMove]);

  useEffect(() => {
    if (selectedFlightId == null || suppressed) {
      return;
    }
    const map = mapRef.current;
    if (!map?.getStyle()) {
      return;
    }

    if (!popupRef.current) {
      const el = document.createElement("div");
      const anchor = popupScreenAnchor(map);
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: "none",
        className: "moon-transit-aircraft-popup",
        anchor: anchor.anchor,
        offset:
          anchor.anchor === "bottom"
            ? ([0, mobilePopupBottomOffsetY(map)] as [number, number])
            : undefined,
      })
        .setDOMContent(el)
        .addTo(map);
      rootRef.current = createRoot(el);
      map.on("move", onMapMove);
      map.on("resize", onMapMove);
      moveListenerMapRef.current = map;
    }

    reposition();
  }, [selectedFlightId, suppressed, mapReadyTick, mapRef, onMapMove, reposition]);

  useEffect(() => {
    if (selectedFlightId == null || suppressed || !rootRef.current) {
      return;
    }
    rootRef.current.render(
      <SelectedAircraftPopupContent
        flight={flight}
        onDismiss={() => setSelectedFlightId(null)}
        onRefreshFlights={onRefreshFlights}
      />
    );
  }, [flight, selectedFlightId, suppressed, setSelectedFlightId, onRefreshFlights]);

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

  /** iOS / in-app browser: `visualViewport` mijenja se bez Mapbox `resize`. */
  useEffect(() => {
    if (selectedFlightId == null || suppressed) {
      return;
    }
    const vv = globalThis.window?.visualViewport;
    if (!vv) {
      return;
    }
    const bump = () => {
      repositionLatest.current();
    };
    vv.addEventListener("resize", bump);
    vv.addEventListener("scroll", bump);
    return () => {
      vv.removeEventListener("resize", bump);
      vv.removeEventListener("scroll", bump);
    };
  }, [selectedFlightId, suppressed]);

  return null;
}
