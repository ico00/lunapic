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
  center: { lng: 15.98, lat: 45.81 },
  zoom: 6,
  pitch: 0,
  bearing: 0,
};
