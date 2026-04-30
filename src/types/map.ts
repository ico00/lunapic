import { DEFAULT_OBSERVER_LOCATION } from "@/lib/defaultObserverLocation";

/**
 * View state for Mapbox (or any map) — kept serializable for Zustand.
 */
export interface MapViewState {
  center: { lng: number; lat: number };
  zoom: number;
  pitch: number;
  bearing: number;
}

export const defaultMapViewState: MapViewState = {
  center: {
    lng: DEFAULT_OBSERVER_LOCATION.lng,
    lat: DEFAULT_OBSERVER_LOCATION.lat,
  },
  zoom: 6,
  pitch: 52,
  bearing: 0,
};
