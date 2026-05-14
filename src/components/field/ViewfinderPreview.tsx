"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ViewfinderAircraftSilhouette } from "@/components/field/ViewfinderAircraftSilhouette";
import { getMoonParallacticAngleDeg } from "@/lib/domain/astro/parallacticAngle";
import { nasaMoonPhaseFrameJpgUrl } from "@/lib/domain/astro/nasaMoonPhaseFrame";
import { appPath } from "@/lib/paths/appPath";

type ViewfinderPreviewProps = {
  /** Simulated instant (`referenceEpochMs`) — drives NASA SVS hourly moon texture. */
  simulatedEpochMs: number;
  angularSizeDeg: number | null;
  distanceToObserverMeters: number | null;
  aircraftLengthMeters: number | null;
  moonDiameterPxAtReferenceSensor?: number | null;
  cameraFrameWidthPx: number;
  cameraFrameHeightPx: number;
  aircraftAltitudeMeters: number | null;
  aircraftHeadingDeg: number | null;
  aircraftGroundSpeedMps: number | null;
  aircraftIcao24?: string | null;
  observerLat: number;
  observerLng: number;
  callSign?: string | null;
  className?: string;
};

const SENSOR_WIDTH_PX = 1422;
const SENSOR_HEIGHT_PX = 948;
const MOON_DIAMETER_PX_NORMALIZED = 948;
const SENSOR_CENTER_X = SENSOR_WIDTH_PX / 2;
const SENSOR_CENTER_Y = SENSOR_HEIGHT_PX / 2;
const REFERENCE_SENSOR_WIDTH_PX = 6000;
const REFERENCE_SENSOR_HEIGHT_PX = 4000;
const MOON_TEXTURE_URL = appPath("/moon-textures/nasa-full-moon.jpg");

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHeadingDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

function formatMeters(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "N/A";
  }
  return `${value.toFixed(0)} m`;
}

function estimateRegionalLengthMeters(icao24: string | null | undefined): number {
  const code = (icao24 ?? "").trim().toLowerCase();
  if (code.length < 2) {
    return 28;
  }
  if (code.startsWith("a") || code.startsWith("c") || code.startsWith("7c")) {
    return 18;
  }
  if (
    code.startsWith("3") ||
    code.startsWith("4") ||
    code.startsWith("5")
  ) {
    return 34;
  }
  if (
    code.startsWith("7") ||
    code.startsWith("8") ||
    code.startsWith("9")
  ) {
    return 38;
  }
  if (
    code.startsWith("0") ||
    code.startsWith("1") ||
    code.startsWith("2")
  ) {
    return 30;
  }
  return 28;
}

function estimateFallbackLengthMeters(input: {
  altitudeMeters: number | null;
  velocityMps: number | null;
  icao24?: string | null;
}): number {
  const altitudeMeters = input.altitudeMeters;
  const velocityKmh =
    input.velocityMps != null && Number.isFinite(input.velocityMps)
      ? input.velocityMps * 3.6
      : null;
  if (altitudeMeters != null && Number.isFinite(altitudeMeters) && altitudeMeters > 9000) {
    return 40;
  }
  if (
    altitudeMeters != null &&
    Number.isFinite(altitudeMeters) &&
    altitudeMeters < 3000 &&
    velocityKmh != null &&
    Number.isFinite(velocityKmh) &&
    velocityKmh < 300
  ) {
    return 12;
  }
  return estimateRegionalLengthMeters(input.icao24);
}

export function ViewfinderPreview({
  simulatedEpochMs,
  angularSizeDeg,
  distanceToObserverMeters,
  aircraftLengthMeters,
  moonDiameterPxAtReferenceSensor,
  cameraFrameWidthPx,
  cameraFrameHeightPx,
  aircraftAltitudeMeters,
  aircraftHeadingDeg,
  aircraftGroundSpeedMps,
  aircraftIcao24,
  observerLat,
  observerLng,
  callSign,
  className,
}: ViewfinderPreviewProps) {
  /** When true: simulates Moon size on a 6000×4000 frame at current focal (small disk in crop). When false: “Zoom” / normalized Moon scale for comparison (~0.5°). */
  const [showReferenceSensorScale, setShowReferenceSensorScale] =
    useState(false);
  const nasaMoonUrl = useMemo(
    () => nasaMoonPhaseFrameJpgUrl(simulatedEpochMs),
    [simulatedEpochMs]
  );
  /** When this equals `nasaMoonUrl`, the last preload for that URL failed — use static fallback. */
  const [nasaLoadFailedForUrl, setNasaLoadFailedForUrl] = useState<string | null>(
    null
  );
  const moonTextureHref =
    nasaLoadFailedForUrl === nasaMoonUrl ? MOON_TEXTURE_URL : nasaMoonUrl;

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setNasaLoadFailedForUrl(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setNasaLoadFailedForUrl(nasaMoonUrl);
      }
    };
    img.src = nasaMoonUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [nasaMoonUrl]);

  const hasReportedAircraftLength =
    aircraftLengthMeters != null &&
    Number.isFinite(aircraftLengthMeters) &&
    aircraftLengthMeters > 0;
  const resolvedAircraftLengthM = hasReportedAircraftLength
    ? aircraftLengthMeters
    : estimateFallbackLengthMeters({
        altitudeMeters: aircraftAltitudeMeters,
        velocityMps: aircraftGroundSpeedMps,
        icao24: aircraftIcao24,
      });

  const moonDiameterPx = useMemo(() => {
    if (!showReferenceSensorScale) {
      return MOON_DIAMETER_PX_NORMALIZED;
    }
    if (
      moonDiameterPxAtReferenceSensor == null ||
      !Number.isFinite(moonDiameterPxAtReferenceSensor) ||
      moonDiameterPxAtReferenceSensor <= 0
    ) {
      return MOON_DIAMETER_PX_NORMALIZED;
    }
    const widthScale =
      cameraFrameWidthPx > 0 ? cameraFrameWidthPx / REFERENCE_SENSOR_WIDTH_PX : 1;
    const heightScale =
      cameraFrameHeightPx > 0 ? cameraFrameHeightPx / REFERENCE_SENSOR_HEIGHT_PX : 1;
    const frameScale = (widthScale + heightScale) / 2;
    const moonDiameterPxForSelectedFrame =
      moonDiameterPxAtReferenceSensor * frameScale;
    const downscaleFactor =
      cameraFrameWidthPx > 0 ? SENSOR_WIDTH_PX / cameraFrameWidthPx : 1;
    const projected = moonDiameterPxForSelectedFrame * downscaleFactor;
    return clamp(projected, 24, SENSOR_HEIGHT_PX * 0.98);
  }, [
    cameraFrameHeightPx,
    cameraFrameWidthPx,
    moonDiameterPxAtReferenceSensor,
    showReferenceSensorScale,
  ]);

  const moonRadiusPx = moonDiameterPx / 2;
  const pixelsPerDegree = moonDiameterPx / 0.5;

  const derivedAngularSizeDeg = useMemo(() => {
    if (
      distanceToObserverMeters == null ||
      !Number.isFinite(distanceToObserverMeters) ||
      distanceToObserverMeters <= 0
    ) {
      return null;
    }
    const thetaRad =
      2 * Math.atan(resolvedAircraftLengthM / (2 * distanceToObserverMeters));
    return (thetaRad * 180) / Math.PI;
  }, [distanceToObserverMeters, resolvedAircraftLengthM]);

  const effectiveAngularSizeDeg =
    angularSizeDeg != null && Number.isFinite(angularSizeDeg) && angularSizeDeg > 0
      ? angularSizeDeg
      : derivedAngularSizeDeg;

  const planeWidthPx = useMemo(() => {
    if (
      effectiveAngularSizeDeg == null ||
      !Number.isFinite(effectiveAngularSizeDeg) ||
      effectiveAngularSizeDeg <= 0
    ) {
      return 0;
    }
    return clamp(effectiveAngularSizeDeg * pixelsPerDegree, 8, SENSOR_WIDTH_PX * 1.2);
  }, [effectiveAngularSizeDeg, pixelsPerDegree]);

  const parallacticAngleDeg = useMemo(
    () =>
      getMoonParallacticAngleDeg(
        new Date(simulatedEpochMs),
        observerLat,
        observerLng
      ),
    [observerLat, observerLng, simulatedEpochMs]
  );

  const correctedHeadingDeg = useMemo(() => {
    if (
      aircraftHeadingDeg == null ||
      !Number.isFinite(aircraftHeadingDeg)
    ) {
      return null;
    }
    return normalizeHeadingDeg(aircraftHeadingDeg - parallacticAngleDeg);
  }, [aircraftHeadingDeg, parallacticAngleDeg]);

  const correctedVisualRotationDeg = useMemo(() => {
    if (correctedHeadingDeg == null || !Number.isFinite(correctedHeadingDeg)) {
      return null;
    }
    // ADS-B heading is clockwise from north; native silhouette nose is up.
    return correctedHeadingDeg;
  }, [correctedHeadingDeg]);

  const trajectoryLine = useMemo(() => {
    if (showReferenceSensorScale) {
      return null;
    }
    if (
      correctedHeadingDeg == null ||
      !Number.isFinite(correctedHeadingDeg) ||
      distanceToObserverMeters == null ||
      !Number.isFinite(distanceToObserverMeters) ||
      distanceToObserverMeters <= 0
    ) {
      return null;
    }
    const headingRad = (correctedHeadingDeg * Math.PI) / 180;
    // Convert north-clockwise heading to screen vector (x right, y down).
    const directionX = Math.sin(headingRad);
    const directionY = -Math.cos(headingRad);
    // Use speed to estimate on-sky motion over a short horizon.
    const speedMps =
      aircraftGroundSpeedMps != null &&
      Number.isFinite(aircraftGroundSpeedMps) &&
      aircraftGroundSpeedMps > 0
        ? aircraftGroundSpeedMps
        : 0;
    const horizonSec = 8;
    const angularSpeedDegPerSec =
      speedMps > 0
        ? (Math.atan2(speedMps, distanceToObserverMeters) * 180) / Math.PI
        : 0;
    const projectionLengthPx = clamp(
      angularSpeedDegPerSec * horizonSec * pixelsPerDegree,
      moonDiameterPx * 0.25,
      moonDiameterPx * 1.25
    );
    const halfLen = projectionLengthPx / 2;
    return {
      x1: SENSOR_CENTER_X - directionX * halfLen,
      y1: SENSOR_CENTER_Y - directionY * halfLen,
      x2: SENSOR_CENTER_X + directionX * halfLen,
      y2: SENSOR_CENTER_Y + directionY * halfLen,
    };
  }, [
    aircraftGroundSpeedMps,
    correctedHeadingDeg,
    distanceToObserverMeters,
    moonDiameterPx,
    pixelsPerDegree,
    showReferenceSensorScale,
  ]);

  const trajectoryDirection = useMemo(() => {
    if (showReferenceSensorScale) {
      return null;
    }
    if (correctedHeadingDeg == null || !Number.isFinite(correctedHeadingDeg)) {
      return null;
    }
    const headingRad = (correctedHeadingDeg * Math.PI) / 180;
    return {
      x: Math.sin(headingRad),
      y: -Math.cos(headingRad),
    };
  }, [correctedHeadingDeg, showReferenceSensorScale]);

  const trajectoryDirectionArrow = useMemo(() => {
    if (!trajectoryDirection) {
      return null;
    }
    const startOffsetPx = moonRadiusPx * 0.06;
    const endOffsetPx = moonRadiusPx * 0.28;
    return {
      x1: SENSOR_CENTER_X + trajectoryDirection.x * startOffsetPx,
      y1: SENSOR_CENTER_Y + trajectoryDirection.y * startOffsetPx,
      x2: SENSOR_CENTER_X + trajectoryDirection.x * endOffsetPx,
      y2: SENSOR_CENTER_Y + trajectoryDirection.y * endOffsetPx,
    };
  }, [moonRadiusPx, trajectoryDirection]);

  const planeHeightPx = Math.max(6, planeWidthPx * 0.28);

  const styleVars = {
    "--viewfinder-plane-width-px": `${planeWidthPx}px`,
    "--viewfinder-plane-height-px": `${planeHeightPx}px`,
    "--viewfinder-plane-rotation-deg": `${correctedVisualRotationDeg ?? 0}deg`,
  } as CSSProperties;

  const showPlane = planeWidthPx > 0;

  return (
    <div className={className}>
      <div className="relative w-full overflow-hidden rounded-lg border border-zinc-800/80 bg-black">
        <div className="relative w-full" style={{ aspectRatio: "3 / 2" }}>
          <svg
            viewBox={`0 0 ${SENSOR_WIDTH_PX} ${SENSOR_HEIGHT_PX}`}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <rect
              x={0}
              y={0}
              width={SENSOR_WIDTH_PX}
              height={SENSOR_HEIGHT_PX}
              fill="#000000"
            />
            <image
              href={moonTextureHref}
              x={SENSOR_CENTER_X - moonRadiusPx}
              y={SENSOR_CENTER_Y - moonRadiusPx}
              width={moonDiameterPx}
              height={moonDiameterPx}
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#viewfinder-moon-clip)"
            />
            <defs>
              <clipPath id="viewfinder-moon-clip">
                <circle
                  cx={SENSOR_CENTER_X}
                  cy={SENSOR_CENTER_Y}
                  r={moonRadiusPx}
                />
              </clipPath>
            </defs>
          </svg>

          {showPlane ? (
            <div
              className="viewfinder-plane-static-layer pointer-events-none absolute inset-0 z-[2]"
              style={styleVars}
              aria-hidden="true"
            >
              <div className="viewfinder-plane-static">
                <ViewfinderAircraftSilhouette
                  className="h-[var(--viewfinder-plane-height-px)] w-[var(--viewfinder-plane-width-px)]"
                />
              </div>
            </div>
          ) : null}
          {(trajectoryLine || trajectoryDirectionArrow) ? (
            <svg
              viewBox={`0 0 ${SENSOR_WIDTH_PX} ${SENSOR_HEIGHT_PX}`}
              className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
              aria-hidden="true"
            >
              {trajectoryLine ? (
                <line
                  x1={trajectoryLine.x1}
                  y1={trajectoryLine.y1}
                  x2={trajectoryLine.x2}
                  y2={trajectoryLine.y2}
                  stroke="#facc15"
                  strokeWidth={6}
                  strokeDasharray="10 6"
                  strokeLinecap="round"
                  opacity={0.95}
                  clipPath="url(#viewfinder-moon-clip-overlay)"
                  markerEnd="url(#viewfinder-trajectory-arrow-overlay)"
                />
              ) : null}
              {trajectoryDirectionArrow ? (
                <line
                  x1={trajectoryDirectionArrow.x1}
                  y1={trajectoryDirectionArrow.y1}
                  x2={trajectoryDirectionArrow.x2}
                  y2={trajectoryDirectionArrow.y2}
                  stroke="#fde047"
                  strokeWidth={4.8}
                  strokeLinecap="round"
                  opacity={0.99}
                  clipPath="url(#viewfinder-moon-clip-overlay)"
                  markerEnd="url(#viewfinder-trajectory-arrow-strong-overlay)"
                />
              ) : null}
              <defs>
                <clipPath id="viewfinder-moon-clip-overlay">
                  <circle
                    cx={SENSOR_CENTER_X}
                    cy={SENSOR_CENTER_Y}
                    r={moonRadiusPx}
                  />
                </clipPath>
                <marker
                  id="viewfinder-trajectory-arrow-overlay"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6.5"
                  refY="3.5"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,7 L7,3.5 z" fill="#facc15" opacity="0.96" />
                </marker>
                <marker
                  id="viewfinder-trajectory-arrow-strong-overlay"
                  markerWidth="11"
                  markerHeight="11"
                  refX="8.8"
                  refY="5.5"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,11 L11,5.5 z" fill="#fde047" opacity="0.99" />
                </marker>
              </defs>
            </svg>
          ) : null}
        </div>
        <div className="flex justify-center border-t border-zinc-800/80 bg-black/85 px-2 py-2">
          <div
            className="inline-flex rounded-md border border-zinc-600/70 bg-zinc-900/90 p-0.5 shadow-inner ring-1 ring-inset ring-zinc-800/80"
            role="group"
            aria-label="Viewfinder scale mode"
          >
            <button
              type="button"
              className={
                showReferenceSensorScale
                  ? "min-w-[4.6rem] rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-900 shadow-sm bg-zinc-100"
                  : "min-w-[4.6rem] rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 transition hover:bg-zinc-800/90 hover:text-zinc-200"
              }
              aria-pressed={showReferenceSensorScale}
              onClick={() => {
                setShowReferenceSensorScale(true);
              }}
            >
              Full frame
            </button>
            <button
              type="button"
              className={
                !showReferenceSensorScale
                  ? "min-w-[4.6rem] rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-900 shadow-sm bg-zinc-100"
                  : "min-w-[4.6rem] rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 transition hover:bg-zinc-800/90 hover:text-zinc-200"
              }
              aria-pressed={!showReferenceSensorScale}
              onClick={() => {
                setShowReferenceSensorScale(false);
              }}
            >
              Zoom
            </button>
          </div>
        </div>
      </div>
      <details className="mt-1.5 rounded-md border border-zinc-800/70 bg-black/30 px-2 py-1.5 text-[color:var(--t-tertiary)]">
        <summary className="cursor-pointer select-none text-[length:var(--fs-label)] font-medium text-[color:var(--t-secondary)]">
          Viewfinder details
        </summary>
        <p className="mt-1.5 font-mono text-[length:var(--fs-meta)] text-[color:var(--t-secondary)]">
          Viewfinder: moon 0.5° = {moonDiameterPx.toFixed(0)} px
          {showReferenceSensorScale
            ? ` (Full frame: ${cameraFrameWidthPx}×${cameraFrameHeightPx} at current focal),`
            : " (Zoom: fixed 0.5° scale for comparison),"}
          distance{" "}
          {formatMeters(distanceToObserverMeters)}, aircraft length{" "}
          {hasReportedAircraftLength
            ? formatMeters(aircraftLengthMeters)
            : `${resolvedAircraftLengthM.toFixed(0)} m (Size Estimated)`}, apparent size{" "}
          {planeWidthPx > 0 ? `${planeWidthPx.toFixed(1)} px` : "N/A"}
          {callSign ? ` (${callSign.trim() || "N/A"})` : ""}. Heading{" "}
          {correctedHeadingDeg != null ? `${correctedHeadingDeg.toFixed(1)}°` : "N/A"} (ADS-B corrected by parallactic
          angle {parallacticAngleDeg.toFixed(1)}°). Moon disk: NASA/GSFC SVS hourly phase (north up); falls back
          to a static texture if the frame cannot load.
        </p>
      </details>
      <style jsx>{`
        .viewfinder-plane-static {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%) rotate(var(--viewfinder-plane-rotation-deg));
          opacity: 0.9;
        }
        .viewfinder-plane-static-layer {
          display: block;
        }
      `}</style>
    </div>
  );
}
