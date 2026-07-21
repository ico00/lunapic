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
  /** Signed elevation difference aircraft − moon (degrees). Negative = below moon. */
  elevationGapDeg?: number | null;
  /** Signed azimuth difference aircraft − moon (degrees). Positive = aircraft CW / right of moon. */
  azimuthGapDeg?: number | null;
  /** Predicted elevation gap aircraft − moon at azimuth alignment (degrees). */
  elevationGapAtAlignmentDeg?: number | null;
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
  elevationGapDeg,
  azimuthGapDeg,
  elevationGapAtAlignmentDeg,
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

  // Vertical offset: SVG Y axis inverted — positive elevationGap (above moon) → negative Y offset.
  const planeOffsetYPx = useMemo(() => {
    if (elevationGapDeg == null || !Number.isFinite(elevationGapDeg)) return 0;
    return -elevationGapDeg * pixelsPerDegree;
  }, [elevationGapDeg, pixelsPerDegree]);

  // Horizontal offset: positive azimuthGap (aircraft CW/right of moon) → positive X offset.
  const planeOffsetXPx = useMemo(() => {
    if (azimuthGapDeg == null || !Number.isFinite(azimuthGapDeg)) return 0;
    return azimuthGapDeg * pixelsPerDegree;
  }, [azimuthGapDeg, pixelsPerDegree]);

  const planeCenterX = SENSOR_CENTER_X + planeOffsetXPx;
  const planeCenterY = SENSOR_CENTER_Y + planeOffsetYPx;
  const planeIsInFrame =
    Math.abs(planeOffsetXPx) < SENSOR_WIDTH_PX / 2 + 20 &&
    Math.abs(planeOffsetYPx) < SENSOR_HEIGHT_PX / 2 + 20;
  // Trajectory arrows only make sense when the plane is near the disc.
  const showTrajectory = planeIsInFrame && Math.abs(elevationGapDeg ?? 0) <= 0.26;

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

  // Fallback direction when gap data is missing: parallactic-corrected compass
  // heading mapped like a chart (north up, east right). Note this is mirrored
  // horizontally relative to the actual sky view — prefer the gap-space vector.
  const headingDirection = useMemo(() => {
    if (correctedHeadingDeg == null || !Number.isFinite(correctedHeadingDeg)) {
      return null;
    }
    const headingRad = (correctedHeadingDeg * Math.PI) / 180;
    return { x: Math.sin(headingRad), y: -Math.cos(headingRad) };
  }, [correctedHeadingDeg]);

  // Predicted on-sky motion: from the current gap position (azimuthGapDeg,
  // elevationGapDeg) toward the alignment point (azimuth gap 0,
  // elevationGapAtAlignmentDeg). Same alt-az gap space the plane position is
  // plotted in, so the path always approaches from the plane's actual side —
  // a compass-heading projection would be mirrored horizontally in sky view.
  const skyMotionDirection = useMemo(() => {
    if (azimuthGapDeg == null || !Number.isFinite(azimuthGapDeg)) {
      return null;
    }
    const dAzDeg = -azimuthGapDeg;
    const dElDeg =
      elevationGapAtAlignmentDeg != null &&
      Number.isFinite(elevationGapAtAlignmentDeg) &&
      elevationGapDeg != null &&
      Number.isFinite(elevationGapDeg)
        ? elevationGapAtAlignmentDeg - elevationGapDeg
        : 0;
    const len = Math.hypot(dAzDeg, dElDeg);
    if (len === 0) {
      return null;
    }
    // Screen coords: +x right (azimuth gap grows), +y down (elevation drops).
    return { x: dAzDeg / len, y: -dElDeg / len };
  }, [azimuthGapDeg, elevationGapAtAlignmentDeg, elevationGapDeg]);

  const motionDirection = skyMotionDirection ?? headingDirection;
  // Silhouette nose (natively up) follows the on-sky motion vector.
  const motionRotationDeg =
    motionDirection != null
      ? (Math.atan2(motionDirection.x, -motionDirection.y) * 180) / Math.PI
      : 0;

  const trajectoryLine = useMemo(() => {
    if (showReferenceSensorScale) {
      return null;
    }
    if (
      motionDirection == null ||
      distanceToObserverMeters == null ||
      !Number.isFinite(distanceToObserverMeters) ||
      distanceToObserverMeters <= 0
    ) {
      return null;
    }
    const directionX = motionDirection.x;
    const directionY = motionDirection.y;
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
      cx: planeCenterX,
      cy: planeCenterY,
      x1: planeCenterX - directionX * halfLen,
      y1: planeCenterY - directionY * halfLen,
      x2: planeCenterX + directionX * halfLen,
      y2: planeCenterY + directionY * halfLen,
    };
  }, [
    aircraftGroundSpeedMps,
    distanceToObserverMeters,
    moonDiameterPx,
    motionDirection,
    pixelsPerDegree,
    planeCenterX,
    planeCenterY,
    showReferenceSensorScale,
  ]);

  const trajectoryDirection = showReferenceSensorScale ? null : motionDirection;

  const trajectoryDirectionArrow = useMemo(() => {
    if (!trajectoryDirection) {
      return null;
    }
    const startOffsetPx = moonRadiusPx * 0.06;
    const endOffsetPx = moonRadiusPx * 0.28;
    return {
      x1: planeCenterX + trajectoryDirection.x * startOffsetPx,
      y1: planeCenterY + trajectoryDirection.y * startOffsetPx,
      x2: planeCenterX + trajectoryDirection.x * endOffsetPx,
      y2: planeCenterY + trajectoryDirection.y * endOffsetPx,
    };
  }, [moonRadiusPx, planeCenterX, planeCenterY, trajectoryDirection]);

  const planeHeightPx = Math.max(6, planeWidthPx * 0.28);

  const planeTopPct = (planeCenterY / SENSOR_HEIGHT_PX) * 100;
  const planeLeftPct = (planeCenterX / SENSOR_WIDTH_PX) * 100;

  const styleVars = {
    "--viewfinder-plane-width-px": `${planeWidthPx}px`,
    "--viewfinder-plane-height-px": `${planeHeightPx}px`,
    "--viewfinder-plane-rotation-deg": `${motionRotationDeg}deg`,
    "--viewfinder-plane-top-pct": `${planeTopPct}%`,
    "--viewfinder-plane-left-pct": `${planeLeftPct}%`,
  } as CSSProperties;

  const showPlane = planeWidthPx > 0 && planeIsInFrame;

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
          {showTrajectory && (trajectoryLine || trajectoryDirectionArrow) ? (
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
          {!planeIsInFrame && planeWidthPx > 0 ? (
            <div
              className="viewfinder-plane-ghost-layer pointer-events-none absolute inset-0 z-[2]"
              style={styleVars}
              aria-hidden="true"
            >
              <div className="viewfinder-plane-ghost">
                <ViewfinderAircraftSilhouette
                  className="h-[var(--viewfinder-plane-height-px)] w-[var(--viewfinder-plane-width-px)]"
                />
              </div>
            </div>
          ) : null}
          {!planeIsInFrame && planeWidthPx > 0 ? (() => {
            // Direction from viewfinder centre toward the off-screen plane.
            const dx = planeOffsetXPx;
            const dy = planeOffsetYPx; // +y = down in screen coords
            const angle = Math.atan2(dx, -dy); // 0=up, +90=right, ±180=down
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);

            // Find the intersection with the nearest frame edge.
            const halfW = SENSOR_WIDTH_PX / 2 - 52;
            const halfH = SENSOR_HEIGHT_PX / 2 - 52;
            const scale = Math.min(
              dx !== 0 ? halfW / Math.abs(dx) : Infinity,
              dy !== 0 ? halfH / Math.abs(dy) : Infinity
            );
            const ex = SENSOR_CENTER_X + dx * scale;
            const ey = SENSOR_CENTER_Y + dy * scale;

            const arrowSize = 40;
            // Triangle tip points away from centre (in direction of off-screen plane).
            const tipX = ex + sinA * arrowSize * 0.5;
            const tipY = ey - cosA * arrowSize * 0.5;
            const baseL = ex - sinA * arrowSize * 0.5 - cosA * arrowSize * 0.5;
            const baseLY = ey + cosA * arrowSize * 0.5 - sinA * arrowSize * 0.5;
            const baseR = ex - sinA * arrowSize * 0.5 + cosA * arrowSize * 0.5;
            const baseRY = ey + cosA * arrowSize * 0.5 + sinA * arrowSize * 0.5;
            const triPath = `M ${tipX},${tipY} L ${baseL},${baseLY} L ${baseR},${baseRY} Z`;

            // Label: show angular separation components
            const sepDeg = Math.sqrt(
              (azimuthGapDeg ?? 0) ** 2 + (elevationGapDeg ?? 0) ** 2
            );
            const label = `${sepDeg.toFixed(1)}°`;
            const labelX = SENSOR_CENTER_X + (dx * scale * 0.6);
            const labelY = SENSOR_CENTER_Y + (dy * scale * 0.6) + 20;

            // Simulated path across the moon disc along the predicted on-sky
            // motion (gap space), so it always enters from the plane's side.
            const ghostPath = (() => {
              if (motionDirection == null) {
                return null;
              }
              const halfLen = moonRadiusPx * 1.18;
              return {
                x1: SENSOR_CENTER_X - motionDirection.x * halfLen,
                y1: SENSOR_CENTER_Y - motionDirection.y * halfLen,
                x2: SENSOR_CENTER_X + motionDirection.x * halfLen,
                y2: SENSOR_CENTER_Y + motionDirection.y * halfLen,
              };
            })();

            return (
              <svg
                viewBox={`0 0 ${SENSOR_WIDTH_PX} ${SENSOR_HEIGHT_PX}`}
                className="pointer-events-none absolute inset-0 z-[4] h-full w-full"
                aria-hidden="true"
              >
                {ghostPath ? (
                  <line
                    x1={ghostPath.x1}
                    y1={ghostPath.y1}
                    x2={ghostPath.x2}
                    y2={ghostPath.y2}
                    stroke="#facc15"
                    strokeWidth={4}
                    strokeDasharray="8 8"
                    strokeLinecap="round"
                    opacity={0.55}
                    markerEnd="url(#viewfinder-ghost-path-arrow)"
                  />
                ) : null}
                <path d={triPath} fill="#facc15" opacity={0.92} />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  fill="#facc15"
                  fontSize={38}
                  fontFamily="monospace"
                  opacity={0.88}
                >
                  {label}
                </text>
                <defs>
                  <marker
                    id="viewfinder-ghost-path-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6.5"
                    refY="3.5"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,7 L7,3.5 z" fill="#facc15" opacity="0.6" />
                  </marker>
                </defs>
              </svg>
            );
          })() : null}
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
                  ? "min-w-[4.6rem] rounded px-2 py-0.5 text-[length:var(--fs-label)] font-semibold uppercase tracking-wide text-zinc-900 shadow-sm bg-zinc-100"
                  : "min-w-[4.6rem] rounded px-2 py-0.5 text-[length:var(--fs-label)] font-semibold uppercase tracking-wide text-[color:var(--t-tertiary)] transition hover:bg-zinc-800/90 hover:text-[color:var(--t-secondary)]"
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
                  ? "min-w-[4.6rem] rounded px-2 py-0.5 text-[length:var(--fs-label)] font-semibold uppercase tracking-wide text-zinc-900 shadow-sm bg-zinc-100"
                  : "min-w-[4.6rem] rounded px-2 py-0.5 text-[length:var(--fs-label)] font-semibold uppercase tracking-wide text-[color:var(--t-tertiary)] transition hover:bg-zinc-800/90 hover:text-[color:var(--t-secondary)]"
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
          angle {parallacticAngleDeg.toFixed(1)}°). While the plane is outside the frame, a simulated silhouette
          on the moon shows its apparent size and crossing direction at current range. Moon disk: NASA/GSFC SVS
          hourly phase (north up); falls back to a static texture if the frame cannot load.
        </p>
      </details>
      <style jsx>{`
        .viewfinder-plane-static {
          position: absolute;
          left: var(--viewfinder-plane-left-pct, 50%);
          top: var(--viewfinder-plane-top-pct, 50%);
          transform: translate(-50%, -50%) rotate(var(--viewfinder-plane-rotation-deg));
          opacity: 0.9;
          filter: drop-shadow(0 0 4px #facc15) drop-shadow(0 0 10px rgba(250, 204, 21, 0.55));
        }
        .viewfinder-plane-static-layer {
          display: block;
        }
        .viewfinder-plane-ghost {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%) rotate(var(--viewfinder-plane-rotation-deg));
          opacity: 0.6;
          filter: drop-shadow(0 0 3px rgba(250, 204, 21, 0.55));
        }
        .viewfinder-plane-ghost-layer {
          display: block;
        }
      `}</style>
    </div>
  );
}
