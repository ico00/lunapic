import type { GroundObserver } from "@/types";
import type { FlightState } from "@/types/flight";
import { aircraftLineOfSightKinematics } from "./geometryEnginePhotographer";

export type CameraSensorType =
  | "fullFrame"
  | "apsC"
  | "apsC16"
  | "microFourThirds";

export const CAMERA_SENSOR_CROP = {
  fullFrame: 1.0,
  apsC: 1.5,
  /** Canon-style APS-C (~1.6× vs full frame). */
  apsC16: 1.6,
  microFourThirds: 2.0,
} as const satisfies Record<CameraSensorType, number>;

/** UI / iteration order (matches `CAMERA_SENSOR_CROP` keys). */
export const CAMERA_SENSOR_ORDER = [
  "fullFrame",
  "apsC",
  "apsC16",
  "microFourThirds",
] as const satisfies readonly CameraSensorType[];

export type ShotFeasibilityTier = "excellent" | "fair" | "poor";

export type ShotFeasibility = {
  readonly tier: ShotFeasibilityTier;
  readonly effectiveFocalLengthMm: number;
  readonly slantRangeMeters: number;
  readonly angularSizeDeg: number;
  readonly moonCoveragePercent: number;
  /** Estimated full Moon diameter in pixels on a 6000×4000 reference frame. */
  readonly moonDiameterPxAtReferenceSensor: number;
  /** Full Moon diameter as a percent of reference frame width. */
  readonly moonFrameWidthPercent: number;
  /** Full Moon diameter as a percent of reference frame height. */
  readonly moonFrameHeightPercent: number;
  /** Full Moon disk area as a percent of the reference frame area. */
  readonly moonFrameAreaPercent: number;
};

const DEFAULT_WINGSPAN_M = 40;
const BASELINE_RANGE_M = 120_000;
const BASELINE_FOCAL_MM = 600;
const MOON_REFERENCE_DIAMETER_DEG = 0.5;
const REFERENCE_SENSOR_WIDTH_PX = 6000;
const REFERENCE_SENSOR_HEIGHT_PX = 4000;
const REFERENCE_MOON_DIAMETER_PX_AT_600MM_FULL_FRAME = 948;

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

export function moonDiameterPxAtReferenceSensor(
  focalLengthMm: number,
  sensorType: CameraSensorType
): number {
  const effectiveMm = effectiveFocalLengthMm(focalLengthMm, sensorType);
  return (
    REFERENCE_MOON_DIAMETER_PX_AT_600MM_FULL_FRAME *
    (effectiveMm / BASELINE_FOCAL_MM)
  );
}

export function moonFrameFillAtReferenceSensor(moonDiameterPx: number): {
  readonly widthPercent: number;
  readonly heightPercent: number;
  readonly areaPercent: number;
} {
  if (!Number.isFinite(moonDiameterPx) || moonDiameterPx <= 0) {
    return { widthPercent: 0, heightPercent: 0, areaPercent: 0 };
  }
  const widthPercent = (moonDiameterPx / REFERENCE_SENSOR_WIDTH_PX) * 100;
  const heightPercent = (moonDiameterPx / REFERENCE_SENSOR_HEIGHT_PX) * 100;
  const moonRadiusPx = moonDiameterPx / 2;
  const moonDiskAreaPx = Math.PI * moonRadiusPx * moonRadiusPx;
  const frameAreaPx = REFERENCE_SENSOR_WIDTH_PX * REFERENCE_SENSOR_HEIGHT_PX;
  const areaPercent = (moonDiskAreaPx / frameAreaPx) * 100;
  return { widthPercent, heightPercent, areaPercent };
}

/** Map reference-baseline diameter (normalized to **6000 px** output width) onto another output width in px. */
export function moonDiameterPxOnOutputFrame(
  moonDiameterPxAtReferenceSensor: number,
  outputFrameWidthPx: number
): number {
  if (
    !Number.isFinite(moonDiameterPxAtReferenceSensor) ||
    outputFrameWidthPx <= 0
  ) {
    return 0;
  }
  return (
    moonDiameterPxAtReferenceSensor *
    (outputFrameWidthPx / REFERENCE_SENSOR_WIDTH_PX)
  );
}

export function moonFrameFillForOutputFrame(params: {
  moonDiameterPxOnFrame: number;
  frameWidthPx: number;
  frameHeightPx: number;
}): {
  readonly widthPercent: number;
  readonly heightPercent: number;
  readonly areaPercent: number;
} {
  const { moonDiameterPxOnFrame, frameWidthPx, frameHeightPx } = params;
  if (
    !Number.isFinite(moonDiameterPxOnFrame) ||
    moonDiameterPxOnFrame <= 0 ||
    frameWidthPx <= 0 ||
    frameHeightPx <= 0
  ) {
    return { widthPercent: 0, heightPercent: 0, areaPercent: 0 };
  }
  const widthPercent = (moonDiameterPxOnFrame / frameWidthPx) * 100;
  const heightPercent = (moonDiameterPxOnFrame / frameHeightPx) * 100;
  const moonRadiusPx = moonDiameterPxOnFrame / 2;
  const moonDiskAreaPx = Math.PI * moonRadiusPx * moonRadiusPx;
  const frameAreaPx = frameWidthPx * frameHeightPx;
  const areaPercent = (moonDiskAreaPx / frameAreaPx) * 100;
  return { widthPercent, heightPercent, areaPercent };
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
  const moonDiameterPx = moonDiameterPxAtReferenceSensor(
    camera.focalLengthMm,
    camera.sensorType
  );
  const moonFill = moonFrameFillAtReferenceSensor(moonDiameterPx);
  return {
    tier: classifyShotFeasibility(kin.slantRangeMeters, coverage),
    effectiveFocalLengthMm: effectiveFocalLengthMm(
      camera.focalLengthMm,
      camera.sensorType
    ),
    slantRangeMeters: kin.slantRangeMeters,
    angularSizeDeg: angularSize,
    moonCoveragePercent: coverage,
    moonDiameterPxAtReferenceSensor: moonDiameterPx,
    moonFrameWidthPercent: moonFill.widthPercent,
    moonFrameHeightPercent: moonFill.heightPercent,
    moonFrameAreaPercent: moonFill.areaPercent,
  };
}

