/**
 * Izvori GeoJSON slojeva u LunaPic karti (Mapbox).
 * Jedan izvor istine — u skladu s `documentation/architecture.md`.
 */
export const FLIGHTS_SOURCE = "flights-geo";
/** Circle layer za pozicije zrakoplova (klik → odabir leta). */
export const FLIGHTS_LAYER_ID = "flights-layer";
export const ROUTES_SOURCE = "routes-geo";
export const MOON_AZ_SOURCE = "moon-azimuth-geo";
export const MOON_AZ_NOW_SOURCE = "moon-azimuth-now-geo";
export const MOON_AZ_NOW_LABEL_SOURCE = "moon-azimuth-now-label-geo";
export const MOON_INT_SOURCE = "moon-intersections-geo";
export const GROUND_OPTIMAL_SOURCE = "optimal-ground-geo";
export const MOON_PATH_FULL_DAY_SOURCE = "moon-path-full-day-geo";
export const SELECTED_STAND_SOURCE = "selected-stand-geo";
export const SELECTED_STAND_SPINE_SOURCE = "selected-stand-spine-geo";
export const SELECTED_FLIGHT_TRAJECTORY_SOURCE = "selected-flight-trajectory-geo";
export const SELECTED_FLIGHT_TRAJECTORY_LABEL_SOURCE =
  "selected-flight-trajectory-label-geo";
export const MOON_PATH_SOURCE = "moon-path-geo";
export const MOON_PATH_LABELS_SOURCE = "moon-path-labels-geo";
export const MOON_PATH_CURRENT_SOURCE = "moon-path-current-geo";
/** Mapbox global DEM for `queryTerrainElevation` (observer ground height from map). */
export const MAPBOX_TERRAIN_DEM_SOURCE = "lunapic-mapbox-terrain-dem";
