import type { AngularRadius, HorizontalDirection } from "./geometry";

/**
 * Apparent state of the Moon for a ground observer and instant in time.
 */
export interface MoonState extends HorizontalDirection {
  /** Geocentric distance, kilometers (optional; from ephemeris). */
  readonly distanceKm: number;
  /** Apparent semi-diameter, degrees. */
  readonly apparentRadius: AngularRadius;
  /** 0 = new, 0.5 = full (optional). */
  readonly phaseFraction: number;
}

/**
 * One sample along the future moon path polyline (ephemeris at fixed intervals).
 */
export type MoonPathSample = {
  readonly epochMs: number;
  readonly azimuthDeg: number;
  readonly altitudeDeg: number;
}
