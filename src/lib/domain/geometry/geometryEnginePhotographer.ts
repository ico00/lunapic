import { AstroService } from "@/lib/domain/astro/astroService";
import type { GroundObserver } from "@/types";
import type { FlightState } from "@/types/flight";
import type { MoonState } from "@/types";
import {
  angularSizeDegFromObjectLengthMeters,
  lineOfSightKinematics,
  moonAngularDiameterDeg,
  type LineOfSightKinematics,
  signedAzimuthGapDeg,
  timeToAzimuthAlignmentSeconds,
  transitDurationCenterToCenterMs,
} from "./lineOfSightKinematics";
import { horizontalToPoint } from "./horizontal";

/**
 * Kinematika tlocrta (ENU): slant, |d(azimuta očišta)/dt|, °/s i rad/s.
 * Zahtjeva v i track (OpenSky/ADS-B). Statički mock: zadajte npr. 220 m/s, 90°.
 */
export function aircraftLineOfSightKinematics(
  observer: GroundObserver,
  flight: Pick<
    FlightState,
    "position" | "baroAltitudeMeters" | "geoAltitudeMeters" | "groundSpeedMps" | "trackDeg"
  >,
  defaultSpeedMps = 200,
  defaultTrackDeg = 90
): LineOfSightKinematics | null {
  const h =
    flight.geoAltitudeMeters ?? flight.baroAltitudeMeters;
  if (h == null) {
    return null;
  }
  const v = flight.groundSpeedMps ?? defaultSpeedMps;
  const tr = flight.trackDeg ?? defaultTrackDeg;
  if (v < 1) {
    return null;
  }
  return lineOfSightKinematics(
    observer,
    flight.position.lat,
    flight.position.lng,
    h,
    v,
    tr
  );
}

export function photographerPack(
  observer: GroundObserver,
  flight: Pick<
    FlightState,
    | "position"
    | "baroAltitudeMeters"
    | "geoAltitudeMeters"
    | "groundSpeedMps"
    | "trackDeg"
  >,
  moon: MoonState,
  at: Date,
  extra: {
    /** Tipičan Airbus A320; prosječna kutna veličina u tranzitu. */
    readonly airlinerLengthMeters?: number;
  } = {}
): {
  kin: LineOfSightKinematics;
  acAz: number;
  moAz: number;
  gapDeg: number;
  acAzRateDegS: number;
  moAzRateDegS: number;
  timeToAlignmentSec: number | null;
  transitDurationMs: number | null;
} | null {
  const kin = aircraftLineOfSightKinematics(observer, flight);
  if (!kin) {
    return null;
  }
  const h =
    flight.geoAltitudeMeters ?? flight.baroAltitudeMeters;
  if (h == null) {
    return null;
  }
  const hObs = horizontalToPoint(
    observer,
    flight.position.lat,
    flight.position.lng,
    h
  );
  const m1 = new Date(at.getTime() + 2_000);
  const mNext = AstroService.getMoonState(m1, observer.lat, observer.lng);
  const dMoon =
    ((mNext.azimuthDeg - moon.azimuthDeg + 540) % 360) - 180;
  const moAzRateDegS = dMoon / 2;
  const acAzRateDegS = (kin.azimuthRateRadPerSec * 180) / Math.PI;
  const acAz = hObs.azimuthDeg;
  const moAz = moon.azimuthDeg;
  const gapDeg = signedAzimuthGapDeg(acAz, moAz);
  const timeToAlignmentSec = timeToAzimuthAlignmentSeconds(
    gapDeg,
    acAzRateDegS,
    moAzRateDegS
  );
  const L = extra.airlinerLengthMeters ?? 40;
  const dMoonFull = moonAngularDiameterDeg(moon.apparentRadius.degrees);
  const dAc = angularSizeDegFromObjectLengthMeters(
    L,
    kin.slantRangeMeters
  );
  const transitDurationMs = transitDurationCenterToCenterMs(
    kin.absAzimuthRateDegPerSec,
    dMoonFull,
    dAc
  );
  return {
    kin,
    acAz,
    moAz,
    gapDeg,
    acAzRateDegS,
    moAzRateDegS,
    timeToAlignmentSec,
    transitDurationMs,
  };
}
