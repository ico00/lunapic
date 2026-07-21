import { FLIGHTS_2D_LAYER_ID, FLIGHTS_LAYER_ID } from "@/lib/map/mapSourceIds";
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
    const pickableLayers = [
      FLIGHTS_LAYER_ID,
      FLIGHTS_2D_LAYER_ID,
      ATC_FLIGHTS_DOT_LAYER_ID,
    ].filter((id) => !!map.getLayer(id));
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
    for (const layerId of pickableLayers) {
      map.on("mouseenter", layerId, onEnter);
      map.on("mouseleave", layerId, onLeave);
    }

    return () => {
      // Avoid getLayer in teardown — style may already be removed (narrow resize).
      map.off("click", onClick);
      for (const layerId of pickableLayers) {
        map.off("mouseenter", layerId, onEnter);
        map.off("mouseleave", layerId, onLeave);
      }
    };
  }, [mapRef, mapReadyTick]);
}
