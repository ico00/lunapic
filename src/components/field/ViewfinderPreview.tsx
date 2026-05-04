"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ViewfinderAircraftSilhouette } from "@/components/field/ViewfinderAircraftSilhouette";
import { nasaMoonPhaseFrameJpgUrl } from "@/lib/domain/astro/nasaMoonPhaseFrame";
import { appPath } from "@/lib/paths/appPath";

type ViewfinderPreviewProps = {
  /** Simulated instant (`referenceEpochMs`) — drives NASA SVS hourly moon texture. */
  simulatedEpochMs: number;
  angularSizeDeg: number | null;
  transitDurationMs: number | null;
  distanceToObserverMeters: number | null;
  aircraftLengthMeters: number | null;
  callSign?: string | null;
  className?: string;
};

const SENSOR_WIDTH_PX = 1422;
const SENSOR_HEIGHT_PX = 948;
const MOON_DIAMETER_PX = 948;
const MOON_RADIUS_PX = MOON_DIAMETER_PX / 2;
const SENSOR_CENTER_X = SENSOR_WIDTH_PX / 2;
const SENSOR_CENTER_Y = SENSOR_HEIGHT_PX / 2;
const PIXELS_PER_DEGREE = MOON_DIAMETER_PX / 0.5;
const DEFAULT_DURATION_MS = 3_000;
const MOON_TEXTURE_URL = appPath("/moon-textures/nasa-full-moon.jpg");
const DEFAULT_AIRCRAFT_LENGTH_M = 40;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatMeters(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "N/A";
  }
  return `${value.toFixed(0)} m`;
}

export function ViewfinderPreview({
  simulatedEpochMs,
  angularSizeDeg,
  transitDurationMs,
  distanceToObserverMeters,
  aircraftLengthMeters,
  callSign,
  className,
}: ViewfinderPreviewProps) {
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

  const resolvedAircraftLengthM =
    aircraftLengthMeters != null &&
    Number.isFinite(aircraftLengthMeters) &&
    aircraftLengthMeters > 0
      ? aircraftLengthMeters
      : DEFAULT_AIRCRAFT_LENGTH_M;

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
    return clamp(effectiveAngularSizeDeg * PIXELS_PER_DEGREE, 8, SENSOR_WIDTH_PX * 1.2);
  }, [effectiveAngularSizeDeg]);

  const animationDurationMs = useMemo(() => {
    if (
      transitDurationMs == null ||
      !Number.isFinite(transitDurationMs) ||
      transitDurationMs <= 0
    ) {
      return DEFAULT_DURATION_MS;
    }
    return clamp(transitDurationMs, 250, 60_000);
  }, [transitDurationMs]);

  const planeHeightPx = Math.max(6, planeWidthPx * 0.28);

  const styleVars = {
    "--viewfinder-plane-width-px": `${planeWidthPx}px`,
    "--viewfinder-plane-height-px": `${planeHeightPx}px`,
    "--viewfinder-plane-start-x-px": `${SENSOR_CENTER_X - MOON_RADIUS_PX + 2}px`,
    "--viewfinder-plane-end-x-px": `${SENSOR_CENTER_X + MOON_RADIUS_PX - 2}px`,
    "--viewfinder-plane-y-px": `${SENSOR_CENTER_Y}px`,
    "--viewfinder-duration-ms": `${animationDurationMs}ms`,
  } as CSSProperties;

  const canAnimate = planeWidthPx > 0;

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
              x={SENSOR_CENTER_X - MOON_RADIUS_PX}
              y={SENSOR_CENTER_Y - MOON_RADIUS_PX}
              width={MOON_DIAMETER_PX}
              height={MOON_DIAMETER_PX}
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#viewfinder-moon-clip)"
            />
            <defs>
              <clipPath id="viewfinder-moon-clip">
                <circle
                  cx={SENSOR_CENTER_X}
                  cy={SENSOR_CENTER_Y}
                  r={MOON_RADIUS_PX}
                />
              </clipPath>
            </defs>
          </svg>

          {canAnimate ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={styleVars}
              aria-hidden="true"
            >
              <div className="viewfinder-plane-motion">
                <ViewfinderAircraftSilhouette className="h-[var(--viewfinder-plane-height-px)] w-[var(--viewfinder-plane-width-px)]" />
              </div>
            </div>
          ) : null}
          {canAnimate ? (
            <div
              className="pointer-events-none absolute inset-0 z-[2]"
              aria-hidden="true"
            >
              <div className="viewfinder-plane-static">
                <ViewfinderAircraftSilhouette
                  className="h-[var(--viewfinder-plane-height-px)] w-[var(--viewfinder-plane-width-px)]"
                  style={styleVars}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-1.5 font-mono text-[0.6rem] text-zinc-500">
        Viewfinder: moon 0.5° = 948 px, distance {formatMeters(distanceToObserverMeters)}, aircraft length{" "}
        {formatMeters(aircraftLengthMeters)}{aircraftLengthMeters == null ? " (fallback 40 m)" : ""}, apparent size{" "}
        {planeWidthPx > 0 ? `${planeWidthPx.toFixed(1)} px` : "N/A"}
        {callSign ? ` (${callSign.trim() || "N/A"})` : ""}. Moon disk: NASA/GSFC SVS hourly phase (north up); falls back
        to a static texture if the frame cannot load.
      </p>
      <style jsx>{`
        .viewfinder-plane-motion {
          position: absolute;
          left: var(--viewfinder-plane-start-x-px);
          top: var(--viewfinder-plane-y-px);
          transform: translate(-50%, -50%);
          animation-name: viewfinderTransit;
          animation-duration: var(--viewfinder-duration-ms);
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes viewfinderTransit {
          from {
            left: var(--viewfinder-plane-start-x-px);
          }
          to {
            left: var(--viewfinder-plane-end-x-px);
          }
        }
        .viewfinder-plane-static {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
        }
      `}</style>
    </div>
  );
}
