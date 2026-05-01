import type { GroundObserver } from "@/types";
import type { FlightState } from "@/types/flight";
import { aircraftLineOfSightKinematics } from "./geometryEnginePhotographer";

export type CameraSensorType = "fullFrame" | "apsC" | "microFourThirds";

export const CAMERA_SENSOR_CROP = {
  fullFrame: 1.0,
  apsC: 1.5,
  microFourThirds: 2.0,
} as const satisfies Record<CameraSensorType, number>;

/** UI / iteration order (matches `CAMERA_SENSOR_CROP` keys). */
export const CAMERA_SENSOR_ORDER = [
  "fullFrame",
  "apsC",
  "microFourThirds",
] as const satisfies readonly CameraSensorType[];

export type ShotFeasibilityTier = "excellent" | "fair" | "poor";

export type ShotFeasibility = {
  readonly tier: ShotFeasibilityTier;
  readonly effectiveFocalLengthMm: number;
  readonly slantRangeMeters: number;
  readonly angularSizeDeg: number;
  readonly moonCoveragePercent: number;
};

const DEFAULT_WINGSPAN_M = 40;
const BASELINE_RANGE_M = 120_000;
const BASELINE_FOCAL_MM = 600;
const MOON_REFERENCE_DIAMETER_DEG = 0.5;

export function effectiveFocalLengthMm(
  focalLengthMm: number,
  sensorType: CameraSensorType
): number {
  const crop = CAMERA_SENSOR_CROP[sensorType];
  return focalLengthMm * crop;
}

/** θ = 2 * atan(w / (2R)) in degrees. */
export function aircraftAngularSizeDeg(
  wingspanMeters: number,
  slantRangeMeters: number
): number {
  if (slantRangeMeters <= 0 || wingspanMeters <= 0) {
    return 0;
  }
  const thetaRad = 2 * Math.atan(wingspanMeters / (2 * slantRangeMeters));
  return (thetaRad * 180) / Math.PI;
}

export function moonCoveragePercent(angularSizeDeg: number): number {
  if (angularSizeDeg <= 0) {
    return 0;
  }
  return (angularSizeDeg / MOON_REFERENCE_DIAMETER_DEG) * 100;
}

export function maxShotRangeMetersForCamera(
  focalLengthMm: number,
  sensorType: CameraSensorType
): number {
  const effectiveMm = effectiveFocalLengthMm(focalLengthMm, sensorType);
  return BASELINE_RANGE_M * (effectiveMm / BASELINE_FOCAL_MM);
}

export function classifyShotFeasibility(
  slantRangeMeters: number,
  coveragePercent: number
): ShotFeasibilityTier {
  const rangeKm = slantRangeMeters / 1000;
  if (rangeKm > 150 || coveragePercent < 3) {
    return "poor";
  }
  if (rangeKm < 80 && coveragePercent > 10) {
    return "excellent";
  }
  return "fair";
}

export function evaluateShotFeasibility(
  observer: GroundObserver,
  flight: Pick<
    FlightState,
    | "position"
    | "baroAltitudeMeters"
    | "geoAltitudeMeters"
    | "groundSpeedMps"
    | "trackDeg"
    | "wingspanMeters"
  >,
  camera: {
    readonly focalLengthMm: number;
    readonly sensorType: CameraSensorType;
  }
): ShotFeasibility | null {
  const kin = aircraftLineOfSightKinematics(observer, flight);
  if (!kin) {
    return null;
  }
  const wingspan = flight.wingspanMeters ?? DEFAULT_WINGSPAN_M;
  const angularSize = aircraftAngularSizeDeg(wingspan, kin.slantRangeMeters);
  const coverage = moonCoveragePercent(angularSize);
  return {
    tier: classifyShotFeasibility(kin.slantRangeMeters, coverage),
    effectiveFocalLengthMm: effectiveFocalLengthMm(
      camera.focalLengthMm,
      camera.sensorType
    ),
    slantRangeMeters: kin.slantRangeMeters,
    angularSizeDeg: angularSize,
    moonCoveragePercent: coverage,
  };
}

