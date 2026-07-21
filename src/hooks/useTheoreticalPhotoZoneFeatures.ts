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

/**
 * Trapezoidal corridor ring: bočni rubovi radijalno se šire od observera.
 * nearHalfWidthM i farHalfWidthM su proporcionalni udaljenosti, pa bočni
 * rubovi svih zona dijele iste kutne linije — bez lomova na spojevima.
 */
function buildZoneRing(
  observer: GroundObserver,
  azimuthDeg: number,
  nearAlongM: number,
  farAlongM: number,
  nearHalfWidthM: number,
  farHalfWidthM: number
): [number, number][] {
  const nearCenter = destinationByAzimuthMeters(observer.lat, observer.lng, azimuthDeg, nearAlongM);
  const farCenter  = destinationByAzimuthMeters(observer.lat, observer.lng, azimuthDeg, farAlongM);
  const leftBearing  = azimuthDeg - 90;
  const rightBearing = azimuthDeg + 90;
  const nearLeft  = destinationByAzimuthMeters(nearCenter.lat, nearCenter.lng, leftBearing,  nearHalfWidthM);
  const nearRight = destinationByAzimuthMeters(nearCenter.lat, nearCenter.lng, rightBearing, nearHalfWidthM);
  const farRight  = destinationByAzimuthMeters(farCenter.lat,  farCenter.lng,  rightBearing, farHalfWidthM);
  const farLeft   = destinationByAzimuthMeters(farCenter.lat,  farCenter.lng,  leftBearing,  farHalfWidthM);
  return [
    [nearLeft.lng,  nearLeft.lat],
    [nearRight.lng, nearRight.lat],
    [farRight.lng,  farRight.lat],
    [farLeft.lng,   farLeft.lat],
    [nearLeft.lng,  nearLeft.lat],
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

    // Sve tri zone dijele iste nearAlong/farAlong krajnje točke — nema čelnih ni
    // bočnih lomova. Razlika između zona je samo kutna širina (skaliranje od osi).
    // Bočni rubovi su kolinearne linije od observera jer hw(d) ∝ d.
    const halfWidthAtFar = Math.max(SELECTED_STAND_HALF_WIDTH_M, (farAlong - nearAlong) * 0.16);
    const halfAngleRad = Math.atan2(halfWidthAtFar, farAlong);
    const hw = (d: number, scale: number) =>
      Math.max(SELECTED_STAND_HALF_WIDTH_M * 0.1 * scale, d * Math.tan(halfAngleRad) * scale);

    const lowRing    = buildZoneRing(observer, moon.azimuthDeg, nearAlong, farAlong,
      hw(nearAlong, 1.00), hw(farAlong, 1.00));
    const mediumRing = buildZoneRing(observer, moon.azimuthDeg, nearAlong, farAlong,
      hw(nearAlong, 0.60), hw(farAlong, 0.60));
    const highRing   = buildZoneRing(observer, moon.azimuthDeg, nearAlong, farAlong,
      hw(nearAlong, 0.30), hw(farAlong, 0.30));

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
    // Oznaka na čelu koridora: koliko je daleko prva točka gdje avion u
    // krstarenju može presjeći Mjesec. Ta udaljenost diktira veličinu siluete
    // (vidi `bestTransitHours.ts`), pa je korisna prije nego digneš stativ.
    const nearEdge = destinationByAzimuthMeters(
      observer.lat,
      observer.lng,
      moon.azimuthDeg,
      nearAlong
    );
    const nearSlantM = Math.hypot(nearAlong, CRUISE_FL_M);
    // Screen-space pomak (em) u smjeru koridora — pri visokom Mjesecu čelo je
    // blizu promatrača, pa bi label inače pao pod ikonu kamere. Konstantan u
    // pikselima na svim zoomovima; y raste prema dolje.
    const azRad = (moon.azimuthDeg * Math.PI) / 180;
    const LABEL_OFFSET_EM = 2.4;
    const labelFeature = {
      type: "Feature" as const,
      properties: {
        kind: "transitOpportunityCorridorLabel",
        label: `${(nearSlantM / 1000).toFixed(0)} km`,
        textOffset: [
          Math.sin(azRad) * LABEL_OFFSET_EM,
          -Math.cos(azRad) * LABEL_OFFSET_EM,
        ] as [number, number],
      },
      geometry: {
        type: "Point" as const,
        coordinates: [nearEdge.lng, nearEdge.lat] as [number, number],
      },
    };

    // Single volume feature for the gradient WebGL layer.
    // The shader interpolates opacity from the centre spine (high confidence)
    // to the outer edge (low confidence) — no need for separate medium/high meshes.
    return [
      ...zoneFeatures,
      labelFeature,
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
    ];
  }, [observer, moon, cameraFocalLengthMm, cameraSensorType]);
}

