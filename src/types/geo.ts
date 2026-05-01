/**
 * WGS84 geodetic and map-related types.
 */

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/**
 * Elevation above the WGS84 ellipsoid (common for GPS) or a local MSL
 * model — document which your provider returns.
 */
export interface GeodeticPosition extends LatLng {
  readonly ellipsoidHeightMeters: number;
}

export interface GroundObserver {
  readonly lat: number;
  readonly lng: number;
  /**
   * Ground height in meters used for ECEF / line-of-sight:
   * - **GPS:** browser `coords.altitude` when present (typically WGS84 ellipsoid height).
   * - **Map placement:** sampled from Mapbox global DEM via `queryTerrainElevation` (terrain model, ~mean sea level — not identical to ellipsoid).
   * Falls back to **0** only when neither source is available.
   */
  readonly groundHeightMeters: number;
}

export interface GeoBounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}
