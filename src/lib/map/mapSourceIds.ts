/**
 * Izvori GeoJSON slojeva u LunaPic karti (Mapbox).
 * Jedan izvor istine — u skladu s `documentation/architecture.md`.
 */
export const FLIGHTS_SOURCE = "flights-geo";
/** Circle layer za pozicije zrakoplova (klik → odabir leta). */
export const FLIGHTS_LAYER_ID = "flights-layer";
/** Ravni 2D simbol (top-down ikona) zrakoplova — prilijepljen uz tlo, bez paralakse. */
export const FLIGHTS_2D_LAYER_ID = "flights-2d-layer";
/** SDF ikona aviona za 2D simbol sloj (bijela silueta → boji se `icon-color` po visini). */
export const FLIGHT_2D_ICON_ID = "flight-2d-plane";
export const FLIGHTS_ATC_LEADER_SOURCE = "flights-atc-leader-geo";
export const FLIGHTS_ATC_PREDICTION_SOURCE = "flights-atc-prediction-geo";
export const FLIGHTS_ATC_LABEL_SOURCE = "flights-atc-label-geo";
export const MOON_AZ_SOURCE = "moon-azimuth-geo";
export const MOON_AZ_NOW_SOURCE = "moon-azimuth-now-geo";
export const MOON_AZ_NOW_LABEL_SOURCE = "moon-azimuth-now-label-geo";
export const MOON_INT_SOURCE = "moon-intersections-geo";
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

/** Krug fotografski relevantnog dometa (80 km oko observera). */
export const OBSERVER_RADIUS_SOURCE = "observer-radius-geo";
export const OBSERVER_RADIUS_LAYER_ID = "observer-radius-layer";

export const VFR_OPENAIP_SOURCE = "vfr-openaip-source";
export const VFR_OPENAIP_LAYER_ID = "vfr-openaip-layer";
export const VFR_OPENAIP_MASK_SOURCE = "vfr-openaip-mask-source";
export const VFR_OPENAIP_MASK_LAYER_ID = "vfr-openaip-mask-layer";

/** Selected-aircraft historical trail (local ADS-B log, last N hours). */
export const SELECTED_FLIGHT_TRAIL_SOURCE = "selected-flight-trail-geo";
export const SELECTED_FLIGHT_TRAIL_LAYER_ID = "selected-flight-trail";

/** Flight history overlay (local ADS-B log). */
export const FLIGHT_HISTORY_HEATMAP_SOURCE = "flight-history-heatmap-geo";
export const FLIGHT_HISTORY_HEATMAP_LAYER_ID = "flight-history-heatmap-layer";
export const FLIGHT_HISTORY_ROUTES_SOURCE = "flight-history-routes-geo";
export const FLIGHT_HISTORY_ROUTES_LAYER_ID = "flight-history-routes-layer";

/** Selected-callsign history: individual session lines + mean path. */
export const CALLSIGN_SESSIONS_SOURCE = "callsign-sessions-geo";
export const CALLSIGN_SESSIONS_LAYER_ID = "callsign-sessions-layer";
export const CALLSIGN_MEAN_SOURCE = "callsign-mean-geo";
export const CALLSIGN_MEAN_LAYER_ID = "callsign-mean-layer";

/** Green ring badge around aircraft with a confirmed disk transit predicted. */
export const CONFIRMED_TRANSIT_BADGE_LAYER_ID = "confirmed-transit-badge-layer";

/** LDZA (Zagreb Airport) runway 04/22 reference centerline — static visual aid, toggled from the Layers popover. */
export const AIRPORT_RUNWAY_SOURCE = "airport-runway-geo";
/** Approach/departure extension segments (`segment: "extension"`). */
export const AIRPORT_RUNWAY_LAYER_ID = "airport-runway-layer";
/** Actual pavement segment (`segment: "pavement"`), styled with the amber "time" accent. */
export const AIRPORT_RUNWAY_PAVEMENT_LAYER_ID = "airport-runway-pavement-layer";
export const AIRPORT_RUNWAY_LABEL_SOURCE = "airport-runway-label-geo";
export const AIRPORT_RUNWAY_LABEL_LAYER_ID = "airport-runway-label-layer";

/**
 * "Stand here" photo-spot forecast picked in the Flight log panel: the spot
 * itself with its tolerance ellipse and historical-spread circle, plus the
 * ground track the spot sweeps during the pass.
 */
export const PHOTO_SPOT_SOURCE = "photo-spot-geo";
/** Historical track scatter (widest, faintest — how much of a lottery this is). */
export const PHOTO_SPOT_SPREAD_LAYER_ID = "photo-spot-spread-layer";
/** Where you must actually stand (tens of metres, elongated toward the Moon). */
export const PHOTO_SPOT_TOLERANCE_LAYER_ID = "photo-spot-tolerance-layer";
export const PHOTO_SPOT_POINT_LAYER_ID = "photo-spot-point-layer";
export const PHOTO_SPOT_LABEL_LAYER_ID = "photo-spot-label-layer";
export const PHOTO_SPOT_PATH_SOURCE = "photo-spot-path-geo";
export const PHOTO_SPOT_PATH_LAYER_ID = "photo-spot-path-layer";

/**
 * Live "stand here" centerline for the selected aircraft — the ground track its
 * Moon shadow sweeps over the next few minutes, with the current spot on it.
 */
export const LIVE_SHADOW_SOURCE = "live-shadow-geo";
export const LIVE_SHADOW_TOLERANCE_LAYER_ID = "live-shadow-tolerance-layer";
export const LIVE_SHADOW_POINT_LAYER_ID = "live-shadow-point-layer";
export const LIVE_SHADOW_PATH_SOURCE = "live-shadow-path-geo";
export const LIVE_SHADOW_PATH_LAYER_ID = "live-shadow-path-layer";
export const LIVE_SHADOW_TICK_LAYER_ID = "live-shadow-tick-layer";
