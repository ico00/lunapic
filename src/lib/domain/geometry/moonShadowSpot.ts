import { getMoonState } from "@/lib/domain/astro/moon";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import type { MoonState } from "@/types";
import {
  DEFAULT_WINGSPAN_M,
  aircraftAngularSizeDeg,
  moonCoveragePercent,
} from "./shotFeasibility";
import { destinationByAzimuthMeters, geodeticToEcef, toDeg, toRad } from "./wgs84";

/**
 * "Stand here" solver — the inverse of the live candidate pipeline.
 *
 * The live pipeline fixes the observer and asks *will this aircraft cross the
 * Moon?*. This solves the other direction: given an aircraft at a known
 * position/altitude and an instant, **where on the ground** must an observer
 * stand for that aircraft to sit on the Moon's disk?
 *
 * The answer is a single point — the aircraft's "moon shadow" — and it moves
 * across the ground at the aircraft's own ground speed, so a track of these
 * points over time is the transit centerline for that flight.
 *
 * ## Why this is not `groundDistance = height / tan(moonAltitude)`
 *
 * That closed form assumes a flat Earth. Over the distances involved here it
 * is not good enough: at 30 km ground range the sphere drops ~70 m below the
 * tangent plane, which tilts the line of sight by `g / 2R` ≈ 0.135° — over a
 * quarter of the Moon's diameter, i.e. a miss. So the flat form is used only
 * as the starting guess, then Newton-refined against the same exact ECEF
 * geometry (`horizontalToPoint`-equivalent) the rest of the app uses, with
 * the Moon re-evaluated **at the candidate point** each step (topocentric
 * parallax shifts the Moon by ~0.0075° per 50 km of observer displacement).
 */

/** Newton steps; the initial flat-Earth guess converges in 2–3. */
const MAX_REFINE_ITERATIONS = 6;
/** Stop when both residuals are under ~0.0006° — 40× finer than the Moon's radius. */
const CONVERGENCE_RAD = 1e-5;
/**
 * Below this Moon altitude the shadow runs away to the horizon (`1/tan`) and
 * the along-track tolerance becomes meaningless. Matches the visibility floor
 * the candidate pipeline already refuses to work below.
 */
const MIN_MOON_ALTITUDE_DEG = CRITICAL_BELOW_DEG;

export type MoonShadowSpot = {
  /** Where the photographer must stand. */
  readonly lat: number;
  readonly lng: number;
  /** Spot → aircraft, straight line (m). Drives the angular size, so the coverage. */
  readonly slantRangeMeters: number;
  /** Spot → aircraft ground projection (m). */
  readonly groundDistanceMeters: number;
  readonly moonAltitudeDeg: number;
  readonly moonAzimuthDeg: number;
  readonly moonApparentRadiusDeg: number;
  /** Aircraft width as a percent of the Moon's diameter at this spot. */
  readonly coveragePercent: number;
  /**
   * How far the photographer may stand off the centerline, perpendicular to
   * the Moon's azimuth, and still keep the aircraft on the disk (m).
   */
  readonly crossTrackToleranceMeters: number;
  /**
   * Same, but along the Moon's azimuth — always the looser of the two by
   * `1 / sin(moonAltitude)`, which is why the usable area is an ellipse
   * stretched toward (and away from) the Moon, never a circle.
   */
  readonly alongTrackToleranceMeters: number;
  /** Residual of the solve, degrees. > ~0.01° means it did not converge. */
  readonly residualDeg: number;
};

export type SolveMoonShadowSpotArgs = {
  readonly aircraftLat: number;
  readonly aircraftLng: number;
  /** Aircraft height above the ellipsoid (m) — geometric preferred, baro accepted. */
  readonly aircraftAltitudeMeters: number;
  readonly atMs: number;
  /** Ground elevation assumed for the solved spot (m). Terrain is not modelled. */
  readonly groundHeightMeters?: number;
  readonly wingspanMeters?: number;
  /**
   * Ephemeris hook — injected so batch callers (a whole predicted track, a
   * 5-minute live lookahead) can share one cache instead of paying for a
   * fresh astronomy-engine solve on every Newton step.
   */
  readonly moonAt?: (atMs: number, lat: number, lng: number, elevM: number) => MoonState;
};

/** Signed difference a − b folded into (−180, 180]. */
function deltaAngleDeg(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Horizontal direction + range from a ground point to the aircraft, exact ECEF. */
function lookAt(
  fromLat: number,
  fromLng: number,
  fromElevM: number,
  toLat: number,
  toLng: number,
  toElevM: number
): { altitudeDeg: number; azimuthDeg: number; slantMeters: number } {
  const a = geodeticToEcef(fromLat, fromLng, fromElevM);
  const b = geodeticToEcef(toLat, toLng, toElevM);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const latRad = toRad(fromLat);
  const lngRad = toRad(fromLng);
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLng = Math.sin(lngRad);
  const cosLng = Math.cos(lngRad);
  const e = -sinLng * dx + cosLng * dy;
  const n = -sinLat * cosLng * dx - sinLat * sinLng * dy + cosLat * dz;
  const u = cosLat * cosLng * dx + cosLat * sinLng * dy + sinLat * dz;
  const horizontal = Math.hypot(e, n);
  return {
    altitudeDeg: toDeg(Math.atan2(u, horizontal)),
    azimuthDeg: (toDeg(Math.atan2(e, n)) + 360) % 360,
    slantMeters: Math.hypot(horizontal, u),
  };
}

/**
 * Solve for the ground point from which the aircraft appears at the Moon's
 * centre. Returns `null` when no such point is usable: Moon too low, aircraft
 * at or below the assumed ground, or the iteration failed to converge.
 */
export function solveMoonShadowSpot(args: SolveMoonShadowSpotArgs): MoonShadowSpot | null {
  const {
    aircraftLat,
    aircraftLng,
    aircraftAltitudeMeters,
    atMs,
    groundHeightMeters = 0,
    wingspanMeters = DEFAULT_WINGSPAN_M,
    moonAt = (t, lat, lng, elevM) => getMoonState(new Date(t), lat, lng, elevM),
  } = args;

  const heightAboveGround = aircraftAltitudeMeters - groundHeightMeters;
  if (!Number.isFinite(heightAboveGround) || heightAboveGround <= 0) {
    return null;
  }

  let moon = moonAt(atMs, aircraftLat, aircraftLng, groundHeightMeters);
  if (moon.altitudeDeg < MIN_MOON_ALTITUDE_DEG) {
    return null;
  }

  // Flat-Earth first guess: walk from under the aircraft, away from the Moon.
  const tanAlt = Math.tan(toRad(moon.altitudeDeg));
  if (!Number.isFinite(tanAlt) || tanAlt <= 0) {
    return null;
  }
  let spot = destinationByAzimuthMeters(
    aircraftLat,
    aircraftLng,
    (moon.azimuthDeg + 180) % 360,
    heightAboveGround / tanAlt
  );

  let look = lookAt(
    spot.lat,
    spot.lng,
    groundHeightMeters,
    aircraftLat,
    aircraftLng,
    aircraftAltitudeMeters
  );
  let residualRad = Infinity;

  for (let i = 0; i < MAX_REFINE_ITERATIONS; i += 1) {
    moon = moonAt(atMs, spot.lat, spot.lng, groundHeightMeters);
    if (moon.altitudeDeg < MIN_MOON_ALTITUDE_DEG) {
      return null;
    }
    look = lookAt(
      spot.lat,
      spot.lng,
      groundHeightMeters,
      aircraftLat,
      aircraftLng,
      aircraftAltitudeMeters
    );

    const dAltRad = toRad(look.altitudeDeg - moon.altitudeDeg);
    const dAzRad = toRad(deltaAngleDeg(look.azimuthDeg, moon.azimuthDeg));
    residualRad = Math.hypot(dAltRad * Math.cos(toRad(moon.altitudeDeg)), dAzRad);
    if (residualRad < CONVERGENCE_RAD) {
      break;
    }

    // Elevation: retreating from the aircraft by s lowers it by s·sin(alt)/slant.
    const sinAlt = Math.max(Math.sin(toRad(moon.altitudeDeg)), 0.05);
    const alongMeters = (dAltRad * look.slantMeters) / sinAlt;
    // Azimuth: stepping right of the aircraft bearing by x rotates it left by x/ground.
    const groundMeters = Math.max(look.slantMeters * Math.cos(toRad(look.altitudeDeg)), 1);
    const perpMeters = dAzRad * groundMeters;

    const stepped = destinationByAzimuthMeters(
      spot.lat,
      spot.lng,
      (look.azimuthDeg + 180) % 360,
      alongMeters
    );
    spot = destinationByAzimuthMeters(
      stepped.lat,
      stepped.lng,
      (look.azimuthDeg + 90) % 360,
      perpMeters
    );
  }

  if (!Number.isFinite(residualRad) || residualRad > 100 * CONVERGENCE_RAD) {
    return null;
  }

  const angularSizeDeg = aircraftAngularSizeDeg(wingspanMeters, look.slantMeters);
  const toleranceRad = toRad(moon.apparentRadius.degrees);
  const crossTrackToleranceMeters = toleranceRad * look.slantMeters;
  const sinAlt = Math.max(Math.sin(toRad(moon.altitudeDeg)), 1e-3);

  return {
    lat: spot.lat,
    lng: spot.lng,
    slantRangeMeters: look.slantMeters,
    groundDistanceMeters: look.slantMeters * Math.cos(toRad(look.altitudeDeg)),
    moonAltitudeDeg: moon.altitudeDeg,
    moonAzimuthDeg: moon.azimuthDeg,
    moonApparentRadiusDeg: moon.apparentRadius.degrees,
    coveragePercent: moonCoveragePercent(angularSizeDeg),
    crossTrackToleranceMeters,
    alongTrackToleranceMeters: crossTrackToleranceMeters / sinAlt,
    residualDeg: toDeg(residualRad),
  };
}

/**
 * Best coverage this aircraft can ever reach, from anywhere on the ground.
 *
 * The shadow spot is always `height / sin(moonAltitude)` away in slant range,
 * so coverage peaks when the Moon is overhead and falls off with `sin`. Used
 * to tell the photographer *up front* that a 50 % target is unreachable for a
 * jet at cruise (40 m span at 11 km tops out near 42 %) instead of returning
 * an empty list with no explanation.
 */
export function maxCoveragePercentForAltitude(
  heightAboveGroundMeters: number,
  moonAltitudeDeg: number,
  wingspanMeters: number = DEFAULT_WINGSPAN_M
): number {
  if (heightAboveGroundMeters <= 0 || moonAltitudeDeg <= 0) {
    return 0;
  }
  const slant = heightAboveGroundMeters / Math.sin(toRad(moonAltitudeDeg));
  return moonCoveragePercent(aircraftAngularSizeDeg(wingspanMeters, slant));
}
