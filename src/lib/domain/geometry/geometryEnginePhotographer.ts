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
import { angularSeparationDeg } from "./sky-separation";
import { geodeticToEcef, toRad } from "./wgs84";

/**
 * Projects aircraft position along a great circle (spherical Earth).
 */
function deadReckonPosition(
  latDeg: number,
  lngDeg: number,
  trackDeg: number,
  groundSpeedMps: number,
  deltaSec: number
): { lat: number; lng: number } {
  const R = 6_371_000;
  const angDist = (groundSpeedMps * deltaSec) / R;
  const lat1 = toRad(latDeg);
  const lng1 = toRad(lngDeg);
  const track = toRad(((trackDeg % 360) + 360) % 360);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
      Math.cos(lat1) * Math.sin(angDist) * Math.cos(track)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(track) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lng: ((((lng2 * 180) / Math.PI) + 540) % 360) - 180,
  };
}

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
  // Use a 20 s forward step — exactly 2× the getMoonState cache bucket (10 s).
  // A 2 s step can land in the SAME bucket as `at`, giving dMoon = 0 (rate = 0)
  // or in the NEXT bucket, giving dMoon = 10 s of moon movement (rate = 5× actual).
  // With 20 s, bucket(at + 20 s) is always bucket(at) + 20 000 ms, so dMoon is
  // always the correct 20-second azimuth change — no zero-rate or 5× inflated-rate bug.
  const m1 = new Date(at.getTime() + 20_000);
  const mNext = AstroService.getMoonState(m1, observer.lat, observer.lng, observer.groundHeightMeters);
  const dMoon =
    ((mNext.azimuthDeg - moon.azimuthDeg + 540) % 360) - 180;
  const moAzRateDegS = dMoon / 20;
  const acAzRateDegS = (kin.azimuthRateRadPerSec * 180) / Math.PI;
  const acAz = hObs.azimuthDeg;
  const moAz = moon.azimuthDeg;
  const gapDeg = signedAzimuthGapDeg(acAz, moAz);
  let timeToAlignmentSec = timeToAzimuthAlignmentSeconds(
    gapDeg,
    acAzRateDegS,
    moAzRateDegS
  );
  // Guard: a plane's LoS azimuth can only sweep as far as its ground track
  // direction (the asymptote as range → ∞). If the moon's azimuth lies beyond
  // that maximum sweep, the linear model gives a spuriously positive t but the
  // plane will never actually reach the moon's azimuth.
  if (timeToAlignmentSec != null) {
    const tr = ((((flight.trackDeg ?? 90) % 360) + 360) % 360);
    const moonReachable =
      kin.azimuthRateRadPerSec >= 0
        ? ((tr - acAz + 360) % 360) >= ((moAz - acAz + 360) % 360)
        : ((acAz - tr + 360) % 360) >= ((acAz - moAz + 360) % 360);
    if (!moonReachable) {
      timeToAlignmentSec = null;
    }
  }
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
  if (timeToAlignmentSec != null) {
    const v = flight.groundSpeedMps ?? 200;
    const tr = flight.trackDeg ?? 90;
    const futureDate = new Date(at.getTime() + timeToAlignmentSec * 1000);
    const futurePos = deadReckonPosition(
      flight.position.lat,
      flight.position.lng,
      tr,
      v,
      timeToAlignmentSec
    );
    const moonFuture = AstroService.getMoonState(
      futureDate,
      observer.lat,
      observer.lng,
      observer.groundHeightMeters
    );
    const acFuture = horizontalToPoint(observer, futurePos.lat, futurePos.lng, h);
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
    // Use elevation gap directly for transit classification — confirmed reliable
    // (validated in real shooting 2026-05-23). The full 2D `sep` diverges for
    // large lookahead times because the linear azimuth model loses accuracy.
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
