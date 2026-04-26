import type { GroundObserver } from "@/types";
import { ecefToEnu, geodeticToEcef, toRad } from "./wgs84";

export type LineOfSightKinematics = {
  /** m */
  readonly slantRangeMeters: number;
  /** Tlocrt (m) */
  readonly horizontalRangeMeters: number;
  /** d(azimuta linije vidljivosti)/dt, rad/s (E–N, pravac od sjevera) */
  readonly azimuthRateRadPerSec: number;
  /** Shorthand: |ω| u °/s */
  readonly absAzimuthRateDegPerSec: number;
};

/**
 * 3D vektor očišta (ENU) u metrima.
 */
export function lineOfSightEnuMeters(
  observer: GroundObserver,
  aircraftLat: number,
  aircraftLng: number,
  aircraftEllipsoidH: number
): { e: number; n: number; u: number } {
  const pObs = geodeticToEcef(
    observer.lat,
    observer.lng,
    observer.groundHeightMeters
  );
  const pAc = geodeticToEcef(aircraftLat, aircraftLng, aircraftEllipsoidH);
  const d = {
    x: pAc.x - pObs.x,
    y: pAc.y - pObs.y,
    z: pAc.z - pObs.z,
  };
  return ecefToEnu(d, observer.lat, observer.lng);
}

/**
 * Tlocrt: promjena horizont. azimuta točke s obzirom na brzinu i track (N=0, kazalj.sat).
 * ω = (v_E·N_h − v_N·E_h) / |R_h|², R_h = (e,n) u tlocrtu.
 */
export function horizontalAzimuthRateRadPerSec(
  e: number,
  n: number,
  groundSpeedMps: number,
  trackDeg: number
): number {
  const t = toRad(((trackDeg % 360) + 360) % 360);
  const ve = groundSpeedMps * Math.sin(t);
  const vn = groundSpeedMps * Math.cos(t);
  const h2 = e * e + n * n;
  if (h2 < 1) {
    return 0;
  }
  return (ve * n - vn * e) / h2;
}

export function lineOfSightKinematics(
  observer: GroundObserver,
  aircraftLat: number,
  aircraftLng: number,
  aircraftEllipsoidH: number,
  groundSpeedMps: number,
  trackDeg: number
): LineOfSightKinematics {
  const { e, n, u } = lineOfSightEnuMeters(
    observer,
    aircraftLat,
    aircraftLng,
    aircraftEllipsoidH
  );
  const horiz = Math.hypot(e, n);
  const slant = Math.hypot(e, n, u);
  const az = horizontalAzimuthRateRadPerSec(e, n, groundSpeedMps, trackDeg);
  return {
    slantRangeMeters: slant,
    horizontalRangeMeters: horiz,
    azimuthRateRadPerSec: az,
    absAzimuthRateDegPerSec: (Math.abs(az) * 180) / Math.PI,
  };
}

/**
 * Aproks. kutna širina predmeta duljine L (m) na slobodni udaljenosti s (m).
 */
export function angularSizeDegFromObjectLengthMeters(
  objectLengthMeters: number,
  slantRangeMeters: number
): number {
  if (slantRangeMeters < 1) {
    return 0;
  }
  return (2 * Math.atan(objectLengthMeters / (2 * slantRangeMeters)) * 180) /
    Math.PI;
}

/**
 * Mjesečev kutni *promjer* (°) iz polutmira.
 */
export function moonAngularDiameterDeg(moonSemiDiameterDeg: number): number {
  return 2 * moonSemiDiameterDeg;
}

/**
 * Vrijeme da se ažurira „križ” azimut–tranzit: promjer Mj + širina zrakoplova, podijeljena s |ω|.
 */
export function transitDurationCenterToCenterMs(
  absAzimuthRateDegPerSec: number,
  moonFullDiameterDeg: number,
  aircraftAngularDiameterDeg: number
): number | null {
  const w = absAzimuthRateDegPerSec;
  if (w < 1e-6) {
    return null;
  }
  const sumDeg = Math.max(0, moonFullDiameterDeg + aircraftAngularDiameterDeg);
  return (sumDeg / w) * 1000;
}

export function signedAzimuthGapDeg(
  aircraftAzDeg: number,
  moonAzDeg: number
): number {
  return ((aircraftAzDeg - moonAzDeg + 540) % 360) - 180;
}

/**
 * t = -gap / (d(ac)/dt − d(moon)/dt) [s] ako je t > 0.
 */
export function timeToAzimuthAlignmentSeconds(
  gapDeg: number,
  aircraftAzimuthRateDegPerSec: number,
  moonAzimuthRateDegPerSec: number
): number | null {
  const dGap = aircraftAzimuthRateDegPerSec - moonAzimuthRateDegPerSec;
  if (Math.abs(dGap) < 1e-5) {
    return null;
  }
  const t = -gapDeg / dGap;
  if (!Number.isFinite(t) || t < 0 || t > 36_000) {
    return null;
  }
  return t;
}

/**
 * T_exp ≤ blurFraction * (θ_ac / |ω|), θ_ac i ω u radianima.
 */
export function minExposureTimeSecondsForAircraftSize(
  absAzimuthRateRadPerSec: number,
  slantMeters: number,
  objectLengthMeters: number,
  blurFraction: number
): number | null {
  if (objectLengthMeters < 0.1 || slantMeters < 1) {
    return null;
  }
  const w = Math.abs(absAzimuthRateRadPerSec);
  if (w < 1e-9) {
    return null;
  }
  const thetaAircraftRad = objectLengthMeters / slantMeters;
  return (blurFraction * thetaAircraftRad) / w;
}
