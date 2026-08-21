import type { AngularRadius, HorizontalDirection } from "./geometry";

/**
 * Apparent state of the Moon for a ground observer and instant in time.
 */
/**
 * Where the Moon is, without what it looks like.
 *
 * Split out from `MoonState` because the phase/illumination half is the
 * expensive half: computing it costs `MoonPhase()` plus two more `Equator()`
 * calls, ~67 % of a full `getMoonState`. Geometry solvers
 * (`solveMoonShadowSpot`, `liveShadowTrack`) evaluate the Moon tens of
 * thousands of times per request and read none of it.
 */
export interface MoonPosition extends HorizontalDirection {
  /** Geocentric distance, kilometers (optional; from ephemeris). */
  readonly distanceKm: number;
  /** Apparent semi-diameter, degrees. */
  readonly apparentRadius: AngularRadius;
}

export interface MoonState extends MoonPosition {
  /** Lunar cycle position from Suncalc (`illumination.phase`): 0 = new, 0.5 = full, 1 = new. */
  readonly phaseFraction: number;
  /** Lit fraction of the lunar disk (`illumination.fraction`): 0 = new, 1 = full. */
  readonly illuminationFraction: number;
}

/**
 * One sample along the future moon path polyline (ephemeris at fixed intervals).
 */
export type MoonPathSample = {
  readonly epochMs: number;
  readonly azimuthDeg: number;
  readonly altitudeDeg: number;
};

/** Polarni i rubni slučajevi (suncalc) kada izlaz/zlaz u jednom dana ne postoje. */
export type MoonRiseSetKind = "normal" | "alwaysUp" | "alwaysDown";

export type MoonRiseSetTimes = {
  readonly rise: Date | null;
  readonly set: Date | null;
  readonly kind: MoonRiseSetKind;
};
