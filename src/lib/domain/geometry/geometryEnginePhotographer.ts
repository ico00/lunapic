import { solveAzimuthAlignment, getAlignmentMoonPosition } from "./azimuthAlignment";
import type { GroundObserver } from "@/types";
import type { FlightState } from "@/types/flight";
import type { MoonState } from "@/types";
import {
  angularSizeDegFromObjectLengthMeters,
  lineOfSightKinematics,
  moonAngularDiameterDeg,
  type LineOfSightKinematics,
  signedAzimuthGapDeg,
  transitDurationCenterToCenterMs,
} from "./lineOfSightKinematics";
import { horizontalToPoint } from "./horizontal";
import { angularSeparationDeg } from "./sky-separation";
import { geodeticToEcef } from "./wgs84";

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
    /**
     * Stvarna duljina zrakoplova (`FlightState.lengthMeters` iz typecode
     * tablice dimenzija) kad je poznata; default 40 m ≈ tipičan airliner.
     */
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
  /** Aircraft elevation − moon elevation at azimuth-alignment time (degrees). null if no alignment predicted. */
  elevationGapAtAlignmentDeg: number | null;
  /** Full 2D sky angular separation at azimuth-alignment time. null if no alignment predicted. */
  separationAtAlignmentDeg: number | null;
  /** Slant range (observer→aircraft) at dead-reckoned alignment position, metres. null if no alignment predicted. */
  futureSlantMeters: number | null;
  /** True when the aircraft disk will actually overlap the moon disk at alignment time. */
  willActuallyTransit: boolean;
  /** Aircraft elevation − moon elevation RIGHT NOW (current position, degrees). */
  currentElevationGapDeg: number;
} | null {
  // Predictions require measured kinematics; drawing helpers may still use defaults.
  const v = flight.groundSpeedMps;
  const tr = flight.trackDeg;
  if (v == null || tr == null || !Number.isFinite(v) || !Number.isFinite(tr) || v < 1) return null;
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
  const mNext = getAlignmentMoonPosition(at.getTime() + 20_000, observer);
  const mNow = getAlignmentMoonPosition(at.getTime(), observer);
  const moAzRateDegS = signedAzimuthGapDeg(mNext.azimuthDeg, mNow.azimuthDeg) / 20;
  const acAzRateDegS = (kin.azimuthRateRadPerSec * 180) / Math.PI;
  const acAz = hObs.azimuthDeg;
  const moAz = moon.azimuthDeg;
  const gapDeg = signedAzimuthGapDeg(acAz, moAz);
  const alignment = solveAzimuthAlignment({
    observer, position: flight.position, altitudeMeters: h, speedMps: v,
    trackDeg: tr, atMs: at.getTime(),
  });
  const timeToAlignmentSec = alignment?.timeSec ?? null;
  const L = extra.airlinerLengthMeters ?? 40;
  const dMoonFull = moonAngularDiameterDeg(moon.apparentRadius.degrees);
  const dAc = angularSizeDegFromObjectLengthMeters(L, kin.slantRangeMeters);
  const transitDurationMs = transitDurationCenterToCenterMs(
    kin.absAzimuthRateDegPerSec,
    dMoonFull,
    dAc
  );

  // Project aircraft to the predicted azimuth-alignment time and check whether
  // it will also be at the correct elevation to cross the moon disk.
  let elevationGapAtAlignmentDeg: number | null = null;
  let separationAtAlignmentDeg: number | null = null;
  let futureSlantMeters: number | null = null;
  let willActuallyTransit = false;
  if (alignment != null) {
    const futurePos = alignment.position;
    const moonFuture = alignment.moon;
    const acFuture = alignment.aircraft;
    const sep = angularSeparationDeg(
      { altitudeDeg: acFuture.altitudeDeg, azimuthDeg: acFuture.azimuthDeg },
      { altitudeDeg: moonFuture.altitudeDeg, azimuthDeg: moonFuture.azimuthDeg }
    );
    const pObs = geodeticToEcef(observer.lat, observer.lng, observer.groundHeightMeters);
    const pFut = geodeticToEcef(futurePos.lat, futurePos.lng, h);
    const futureSlant = Math.hypot(
      pFut.x - pObs.x,
      pFut.y - pObs.y,
      pFut.z - pObs.z
    );
    const dAcFuture = angularSizeDegFromObjectLengthMeters(L, futureSlant);
    futureSlantMeters = futureSlant;
    elevationGapAtAlignmentDeg = acFuture.altitudeDeg - moonFuture.altitudeDeg;
    separationAtAlignmentDeg = sep;
    // Elevation is meaningful only after the solver verifies azimuth alignment.
    willActuallyTransit =
      Math.abs(elevationGapAtAlignmentDeg) <= moonFuture.apparentRadius.degrees + dAcFuture / 2;
  }

  return {
    kin,
    acAz,
    moAz,
    gapDeg,
    acAzRateDegS,
    moAzRateDegS,
    timeToAlignmentSec,
    transitDurationMs,
    elevationGapAtAlignmentDeg,
    separationAtAlignmentDeg,
    futureSlantMeters,
    willActuallyTransit,
    currentElevationGapDeg: hObs.altitudeDeg - moon.altitudeDeg,
  };
}
