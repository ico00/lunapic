import { FLIGHTS_LAYER_ID } from "@/lib/map/mapSourceIds";
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
    if (!map || !map.getLayer(FLIGHTS_LAYER_ID)) {
      return;
    }

    const onClick = (e: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [FLIGHTS_LAYER_ID],
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
    map.on("mouseenter", FLIGHTS_LAYER_ID, onEnter);
    map.on("mouseleave", FLIGHTS_LAYER_ID, onLeave);

    return () => {
      map.off("click", onClick);
      map.off("mouseenter", FLIGHTS_LAYER_ID, onEnter);
      map.off("mouseleave", FLIGHTS_LAYER_ID, onLeave);
    };
  }, [mapRef, mapReadyTick]);
}
