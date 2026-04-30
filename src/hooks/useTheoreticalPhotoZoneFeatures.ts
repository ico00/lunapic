import { isMoonVisibleFromMoonState } from "@/lib/domain/astro/moonVisibility";
import { moonFieldVisibilityAdvice } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import {
  maxShotRangeMetersForCamera,
  type CameraSensorType,
} from "@/lib/domain/geometry/shotFeasibility";
import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import {
  CRUISE_FL_M,
  SELECTED_STAND_HALF_WIDTH_M,
} from "@/lib/map/mapOverlayConstants";
import type { GroundObserver } from "@/types";
import type { MoonState } from "@/types/moon";
import type { Feature } from "geojson";
import { useMemo } from "react";

const CRUISE_ALTITUDE_MIN_M = 8_000;
const CRUISE_ALTITUDE_MAX_M = 12_000;
const MIN_ALONG_M = 2_000;
const NEAR_BUFFER_M = 4_000;
const FAR_BUFFER_M = 8_000;
const CORRIDOR_VOLUME_MAX_M = 30_000;
const CORRIDOR_VOLUME_MIN_M = 250;

type Args = {
  observer: GroundObserver;
  moon: MoonState;
  cameraFocalLengthMm: number;
  cameraSensorType: CameraSensorType;
};

type ConfidenceTier = "low" | "medium" | "high";

function buildZoneRing(
  observer: GroundObserver,
  azimuthDeg: number,
  nearAlongM: number,
  farAlongM: number,
  halfWidthM: number
): [number, number][] {
  const nearCenter = destinationByAzimuthMeters(
    observer.lat,
    observer.lng,
    azimuthDeg,
    nearAlongM
  );
  const farCenter = destinationByAzimuthMeters(
    observer.lat,
    observer.lng,
    azimuthDeg,
    farAlongM
  );
  const leftBearing = azimuthDeg - 90;
  const rightBearing = azimuthDeg + 90;
  const nearLeft = destinationByAzimuthMeters(
    nearCenter.lat,
    nearCenter.lng,
    leftBearing,
    halfWidthM
  );
  const nearRight = destinationByAzimuthMeters(
    nearCenter.lat,
    nearCenter.lng,
    rightBearing,
    halfWidthM
  );
  const farRight = destinationByAzimuthMeters(
    farCenter.lat,
    farCenter.lng,
    rightBearing,
    halfWidthM
  );
  const farLeft = destinationByAzimuthMeters(
    farCenter.lat,
    farCenter.lng,
    leftBearing,
    halfWidthM
  );
  return [
    [nearLeft.lng, nearLeft.lat],
    [nearRight.lng, nearRight.lat],
    [farRight.lng, farRight.lat],
    [farLeft.lng, farLeft.lat],
    [nearLeft.lng, nearLeft.lat],
  ];
}

/**
 * Observer-centric transit opportunity corridor for the current moon geometry.
 * It refreshes with simulated time because moon azimuth/altitude evolve.
 */
export function useTransitOpportunityCorridorFeatures(a: Args): readonly Feature[] {
  const { observer, moon, cameraFocalLengthMm, cameraSensorType } = a;
  return useMemo(() => {
    if (!isMoonVisibleFromMoonState(moon)) {
      return [];
    }
    if (moonFieldVisibilityAdvice(moon.altitudeDeg).tier !== "optimal") {
      return [];
    }
    const altRad = (moon.altitudeDeg * Math.PI) / 180;
    const tanAlt = Math.tan(altRad);
    if (!Number.isFinite(tanAlt) || tanAlt <= 0.001) {
      return [];
    }

    const maxRangeM = maxShotRangeMetersForCamera(
      cameraFocalLengthMm,
      cameraSensorType
    );
    const minAlongRaw = CRUISE_ALTITUDE_MIN_M / tanAlt;
    const maxAlongRaw = CRUISE_ALTITUDE_MAX_M / tanAlt;
    const alongLower = Math.min(minAlongRaw, maxAlongRaw);
    const alongUpper = Math.max(minAlongRaw, maxAlongRaw);
    const maxGroundFromRange = Math.sqrt(
      Math.max(0, maxRangeM * maxRangeM - CRUISE_FL_M * CRUISE_FL_M)
    );
    const nearAlong = Math.max(MIN_ALONG_M, alongLower - NEAR_BUFFER_M);
    const farAlong = Math.min(maxGroundFromRange, alongUpper + FAR_BUFFER_M);
    if (!(farAlong > nearAlong)) {
      return [];
    }

    const halfWidthM = Math.max(SELECTED_STAND_HALF_WIDTH_M, (farAlong - nearAlong) * 0.16);
    const lowRing = buildZoneRing(
      observer,
      moon.azimuthDeg,
      nearAlong,
      farAlong,
      halfWidthM
    );
    const mediumNear = nearAlong + (farAlong - nearAlong) * 0.12;
    const mediumFar = farAlong - (farAlong - nearAlong) * 0.12;
    const mediumRing = buildZoneRing(
      observer,
      moon.azimuthDeg,
      mediumNear,
      mediumFar,
      halfWidthM * 0.72
    );
    const highNear = nearAlong + (farAlong - nearAlong) * 0.24;
    const highFar = farAlong - (farAlong - nearAlong) * 0.24;
    const highRing = buildZoneRing(
      observer,
      moon.azimuthDeg,
      highNear,
      highFar,
      halfWidthM * 0.45
    );

    const confidenceZones: ReadonlyArray<{
      tier: ConfidenceTier;
      ring: [number, number][];
    }> = [
      { tier: "low", ring: lowRing },
      { tier: "medium", ring: mediumRing },
      { tier: "high", ring: highRing },
    ];
    const volumeHeightMeters = Math.min(
      CORRIDOR_VOLUME_MAX_M,
      Math.max(CORRIDOR_VOLUME_MIN_M, Math.tan(altRad) * farAlong)
    );
    const zoneFeatures = confidenceZones.map(({ tier, ring }) => ({
      type: "Feature" as const,
      properties: {
        kind: "transitOpportunityCorridor",
        confidence: tier,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [ring],
      },
    }));
    return [
      ...zoneFeatures,
      {
        type: "Feature",
        properties: {
          kind: "transitOpportunityCorridorVolume",
          confidence: "low" as const,
          volumeHeightMeters,
        },
        geometry: {
          type: "Polygon",
          coordinates: [lowRing],
        },
      } as const,
      {
        type: "Feature",
        properties: {
          kind: "transitOpportunityCorridorVolume",
          confidence: "medium" as const,
          volumeHeightMeters: volumeHeightMeters * 0.82,
        },
        geometry: {
          type: "Polygon",
          coordinates: [mediumRing],
        },
      } as const,
      {
        type: "Feature",
        properties: {
          kind: "transitOpportunityCorridorVolume",
          confidence: "high" as const,
          volumeHeightMeters: volumeHeightMeters * 0.66,
        },
        geometry: {
          type: "Polygon",
          coordinates: [highRing],
        },
      } as const,
    ];
  }, [observer, moon, cameraFocalLengthMm, cameraSensorType]);
}

