/**
 * Spherical and angular types used in sky geometry (moon vs aircraft).
 */

export interface HorizontalDirection {
  /** Altitude above mathematical horizon, degrees. */
  readonly altitudeDeg: number;
  /** True azimuth from north, degrees [0, 360). */
  readonly azimuthDeg: number;
}

export interface AngularRadius {
  /** Half-angle of a disc, degrees. */
  readonly degrees: number;
}

/**
 * 3D unit direction in a local East-North-Up frame at the observer.
 */
export interface ENUUnitVector {
  readonly east: number;
  readonly north: number;
  readonly up: number;
}
