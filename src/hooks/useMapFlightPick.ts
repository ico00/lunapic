import { FLIGHTS_LAYER_ID } from "@/lib/map/mapSourceIds";
import { ATC_FLIGHTS_DOT_LAYER_ID } from "@/lib/map/registerMoonTransitLayers";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { Map, MapMouseEvent } from "mapbox-gl";
import { useEffect, type RefObject } from "react";

/**
 * Klik na kružnicu leta na karti → `selectedFlightId` u storeu; klik u prazno → očisti odabir.
 * Pokazivač `pointer` iznad točkica.
 */
export function useMapFlightPick(
  mapRef: RefObject<Map | null>,
  mapReadyTick: number
): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const pickableLayers = [FLIGHTS_LAYER_ID, ATC_FLIGHTS_DOT_LAYER_ID].filter(
      (id) => !!map.getLayer(id)
    );
    if (pickableLayers.length === 0) {
      return;
    }

    const onClick = (e: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: pickableLayers,
      });
      if (hits.length > 0) {
        const raw = hits[0].properties?.id;
        const id = raw != null ? String(raw) : "";
        if (id) {
          useMoonTransitStore.getState().setSelectedFlightId(id);
          return;
        }
      }
      useMoonTransitStore.getState().setSelectedFlightId(null);
    };

    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", onClick);
    if (map.getLayer(FLIGHTS_LAYER_ID)) {
      map.on("mouseenter", FLIGHTS_LAYER_ID, onEnter);
      map.on("mouseleave", FLIGHTS_LAYER_ID, onLeave);
    }
    if (map.getLayer(ATC_FLIGHTS_DOT_LAYER_ID)) {
      map.on("mouseenter", ATC_FLIGHTS_DOT_LAYER_ID, onEnter);
      map.on("mouseleave", ATC_FLIGHTS_DOT_LAYER_ID, onLeave);
    }

    return () => {
      map.off("click", onClick);
      if (map.getLayer(FLIGHTS_LAYER_ID)) {
        map.off("mouseenter", FLIGHTS_LAYER_ID, onEnter);
        map.off("mouseleave", FLIGHTS_LAYER_ID, onLeave);
      }
      if (map.getLayer(ATC_FLIGHTS_DOT_LAYER_ID)) {
        map.off("mouseenter", ATC_FLIGHTS_DOT_LAYER_ID, onEnter);
        map.off("mouseleave", ATC_FLIGHTS_DOT_LAYER_ID, onLeave);
      }
    };
  }, [mapRef, mapReadyTick]);
}
