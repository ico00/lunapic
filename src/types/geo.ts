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
  /** meters above the ellipsoid; default 0 if unknown. */
  readonly groundHeightMeters: number;
}

export interface GeoBounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}
