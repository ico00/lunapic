import { applyFlightLayerColorPaint } from "@/lib/map/flightAltitudeColor";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { Map } from "mapbox-gl";
import { useEffect, type RefObject } from "react";

/**
 * Sinkronizira Mapbox `circle-color` / `model-color` za sloj letova s preferencijom
 * iz storea; nakon async nadogradnje na 3D model ponovno primjenjuje boje na `idle`.
 */
export function useMapFlightAltitudeColorsPaint(
  mapRef: RefObject<Map | null>,
  mapReadyTick: number
): void {
  const mapAircraftAltitudeColors = useMoonTransitStore(
    (s) => s.mapAircraftAltitudeColors
  );
  const mapDisplayMode = useMoonTransitStore((s) => s.mapDisplayMode);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapReadyTick === 0) {
      return;
    }
    const run = () =>
      applyFlightLayerColorPaint(
        map,
        useMoonTransitStore.getState().mapAircraftAltitudeColors
      );
    run();
    map.on("idle", run);
    return () => {
      map.off("idle", run);
    };
  }, [mapRef, mapReadyTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapReadyTick === 0) {
      return;
    }
    applyFlightLayerColorPaint(map, mapAircraftAltitudeColors);
  }, [mapRef, mapReadyTick, mapAircraftAltitudeColors, mapDisplayMode]);
}
