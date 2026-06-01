import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import { OBSERVER_RADIUS_SOURCE } from "@/lib/map/mapSourceIds";
import type mapboxgl from "mapbox-gl";
import { useEffect, type RefObject } from "react";

const RADIUS_KM = 80;
const RING_STEPS = 120;

function buildObserverRadiusFeature(lat: number, lng: number) {
  const coords: [number, number][] = [];
  for (let i = 0; i <= RING_STEPS; i++) {
    const bearing = (i / RING_STEPS) * 360;
    const p = destinationByAzimuthMeters(lat, lng, bearing, RADIUS_KM * 1000);
    coords.push([p.lng, p.lat]);
  }
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: coords },
      },
    ],
  };
}

export function useMapObserverRadiusSync(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapReadyTick: number,
  observerLat: number,
  observerLng: number
): void {
  useEffect(() => {
    if (mapReadyTick <= 0) return;
    const src = mapRef.current?.getSource(
      OBSERVER_RADIUS_SOURCE
    ) as mapboxgl.GeoJSONSource | undefined;
    src?.setData(buildObserverRadiusFeature(observerLat, observerLng));
  }, [mapRef, mapReadyTick, observerLat, observerLng]);
}
