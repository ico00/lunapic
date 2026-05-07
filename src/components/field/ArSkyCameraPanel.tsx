"use client";

import { useMoonStateComputed, useTransitCandidates } from "@/hooks/useTransitCandidates";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import type { FlightState } from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TrackedMarker = {
  id: string;
  label: string;
  azimuthDeg: number;
  altitudeDeg: number;
  isSelected: boolean;
};

type DevicePose = {
  headingDeg: number | null;
  pitchDeg: number;
};

const WATCHED_IDS_STORAGE_KEY = "moonTransitWatchedCandidateFlightIds";
const MAX_TRACKED_MARKERS = 24;

function normalizeSignedAngleDeg(deg: number): number {
  return ((deg + 540) % 360) - 180;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothAngleDeg(prevDeg: number, nextDeg: number, alpha: number): number {
  const delta = normalizeSignedAngleDeg(nextDeg - prevDeg);
  return (prevDeg + delta * alpha + 360) % 360;
}

function toCameraPitchDeg(beta: number | null): number {
  if (beta == null || !Number.isFinite(beta)) {
    return 0;
  }
  const pitch = beta - 90;
  return Math.max(-80, Math.min(80, pitch));
}

function markerFromFlight(
  observer: { lat: number; lng: number; groundHeightMeters: number },
  flight: FlightState
): TrackedMarker {
  const targetAlt = flight.geoAltitudeMeters ?? flight.baroAltitudeMeters ?? 0;
  const horizontal = horizontalToPoint(
    observer,
    flight.position.lat,
    flight.position.lng,
    targetAlt
  );
  return {
    id: flight.id,
    label: flight.callSign?.trim() || flight.id,
    azimuthDeg: horizontal.azimuthDeg,
    altitudeDeg: horizontal.altitudeDeg,
    isSelected: false,
  };
}

export function ArSkyCameraPanel() {
  const observer = useObserverStore((s) => s.observer);
  const flights = useMoonTransitStore((s) => s.flights);
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const openSkyLatencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const candidates = useTransitCandidates();
  const moon = useMoonStateComputed();

  const [open, setOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [orientationError, setOrientationError] = useState<string | null>(null);
  const [pose, setPose] = useState<DevicePose>({ headingDeg: null, pitchDeg: 0 });
  const [calibrationOffsetDeg, setCalibrationOffsetDeg] = useState(0);
  const [renderNowMs, setRenderNowMs] = useState(() => Date.now());
  const [viewport, setViewport] = useState({ w: 360, h: 640 });
  const [watchedFlightIds, setWatchedFlightIds] = useState<Set<string>>(new Set());
  const [showAllNearbyFlights, setShowAllNearbyFlights] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const id = globalThis.setInterval(() => {
      setRenderNowMs(Date.now());
    }, 250);
    return () => {
      globalThis.clearInterval(id);
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof globalThis === "undefined") {
      return;
    }
    try {
      const raw = globalThis.localStorage.getItem(WATCHED_IDS_STORAGE_KEY);
      if (!raw) {
        setWatchedFlightIds(new Set());
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setWatchedFlightIds(new Set());
        return;
      }
      setWatchedFlightIds(
        new Set(parsed.filter((value): value is string => typeof value === "string"))
      );
    } catch {
      setWatchedFlightIds(new Set());
    }
  }, [open]);

  const trackedMarkers = useMemo(() => {
    const byId = new Map(flights.map((f) => [f.id, f] as const));
    const ids = new Set<string>();
    const orderedIds: string[] = [];
    if (selectedFlightId) {
      ids.add(selectedFlightId);
      orderedIds.push(selectedFlightId);
    }
    for (const watchedId of watchedFlightIds) {
      if (!ids.has(watchedId)) {
        ids.add(watchedId);
        orderedIds.push(watchedId);
      }
    }
    for (const candidate of candidates.slice(0, 6)) {
      if (!ids.has(candidate.flight.id)) {
        ids.add(candidate.flight.id);
        orderedIds.push(candidate.flight.id);
      }
    }
    // AR should remain useful without manual selection: optionally auto-include nearby live flights.
    if (showAllNearbyFlights) {
      for (const flight of flights) {
        if (!ids.has(flight.id)) {
          ids.add(flight.id);
          orderedIds.push(flight.id);
        }
      }
    }
    const at = Math.max(renderNowMs, referenceEpochMs);
    return orderedIds
      .map((id) => byId.get(id))
      .filter((f): f is FlightState => f != null)
      .map((flight) => {
        const extrapolated = extrapolateFlightForDisplay(
          flight,
          at,
          openSkyLatencySkewMs
        );
        const marker = markerFromFlight(observer, extrapolated);
        return {
          ...marker,
          isSelected: marker.id === selectedFlightId,
        };
      })
      .filter((marker) => marker.altitudeDeg >= -5)
      .slice(0, MAX_TRACKED_MARKERS);
  }, [
    candidates,
    flights,
    observer,
    openSkyLatencySkewMs,
    referenceEpochMs,
    renderNowMs,
    selectedFlightId,
    showAllNearbyFlights,
    watchedFlightIds,
  ]);

  const cameraAzimuthDeg = useMemo(() => {
    if (pose.headingDeg == null) {
      return null;
    }
    return (pose.headingDeg + calibrationOffsetDeg + 360) % 360;
  }, [pose.headingDeg, calibrationOffsetDeg]);

  const markerScreen = useMemo(() => {
    if (cameraAzimuthDeg == null) {
      return [];
    }
    const horizontalFovDeg = 62;
    const verticalFovDeg = 48;
    return trackedMarkers.map((marker) => {
      const dxDeg = normalizeSignedAngleDeg(marker.azimuthDeg - cameraAzimuthDeg);
      const dyDeg = marker.altitudeDeg - pose.pitchDeg;
      const x = viewport.w * (0.5 + dxDeg / horizontalFovDeg);
      const y = viewport.h * (0.5 - dyDeg / verticalFovDeg);
      const isVisible = x >= -48 && x <= viewport.w + 48 && y >= -24 && y <= viewport.h + 24;
      return {
        ...marker,
        x,
        y,
        dxDeg,
        dyDeg,
        isVisible,
      };
    });
  }, [cameraAzimuthDeg, pose.pitchDeg, trackedMarkers, viewport.h, viewport.w]);

  const offscreenArrows = useMemo(() => {
    return markerScreen
      .filter((marker) => !marker.isVisible)
      .map((marker) => {
        const clampedX = Math.min(viewport.w - 16, Math.max(16, marker.x));
        const clampedY = Math.min(viewport.h - 18, Math.max(18, marker.y));
        const angleDeg =
          Math.abs(marker.dxDeg) >= Math.abs(marker.dyDeg)
            ? marker.dxDeg > 0
              ? 90
              : -90
            : marker.dyDeg > 0
              ? 180
              : 0;
        return {
          ...marker,
          x: clampedX,
          y: clampedY,
          angleDeg,
        };
      });
  }, [markerScreen, viewport.h, viewport.w]);

  const radarBlips = useMemo(() => {
    if (cameraAzimuthDeg == null) {
      return [];
    }
    const radarRadiusPx = 34;
    return trackedMarkers.map((marker) => {
      const relAzDeg = normalizeSignedAngleDeg(marker.azimuthDeg - cameraAzimuthDeg);
      const relRad = (relAzDeg * Math.PI) / 180;
      const altitudeNormalized = Math.max(0, Math.min(1, (marker.altitudeDeg + 10) / 80));
      const distanceScale = 0.2 + (1 - altitudeNormalized) * 0.8;
      const r = radarRadiusPx * distanceScale;
      const x = Math.sin(relRad) * r;
      const y = -Math.cos(relRad) * r;
      return {
        ...marker,
        x,
        y,
      };
    });
  }, [cameraAzimuthDeg, trackedMarkers]);

  const moonScreen = useMemo(() => {
    if (cameraAzimuthDeg == null) {
      return null;
    }
    const horizontalFovDeg = 62;
    const verticalFovDeg = 48;
    const dxDeg = normalizeSignedAngleDeg(moon.azimuthDeg - cameraAzimuthDeg);
    const dyDeg = moon.altitudeDeg - pose.pitchDeg;
    return {
      x: viewport.w * (0.5 + dxDeg / horizontalFovDeg),
      y: viewport.h * (0.5 - dyDeg / verticalFovDeg),
      visible:
        viewport.w * (0.5 + dxDeg / horizontalFovDeg) >= -40 &&
        viewport.w * (0.5 + dxDeg / horizontalFovDeg) <= viewport.w + 40 &&
        viewport.h * (0.5 - dyDeg / verticalFovDeg) >= -40 &&
        viewport.h * (0.5 - dyDeg / verticalFovDeg) <= viewport.h + 40,
    };
  }, [cameraAzimuthDeg, moon.altitudeDeg, moon.azimuthDeg, pose.pitchDeg, viewport.h, viewport.w]);

  const requestOrientation = useCallback(async () => {
    setOrientationError(null);
    try {
      const orientationApi = globalThis as unknown as {
        DeviceOrientationEvent?: {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
      };
      if (typeof orientationApi.DeviceOrientationEvent?.requestPermission === "function") {
        const r = await orientationApi.DeviceOrientationEvent.requestPermission();
        if (r !== "granted") {
          setOrientationError("Orientation permission denied.");
          return;
        }
      }
      const onOrientation = (event: DeviceOrientationEvent) => {
        const webkitEvent = event as DeviceOrientationEvent & {
          webkitCompassHeading?: number;
        };
        const nextHeading =
          typeof webkitEvent.webkitCompassHeading === "number"
            ? webkitEvent.webkitCompassHeading % 360
            : event.alpha == null
              ? null
              : (360 - event.alpha + 360) % 360;
        const nextPitch = toCameraPitchDeg(event.beta);
        setPose((prev) => {
          const smoothedHeading =
            nextHeading == null
              ? null
              : prev.headingDeg == null
                ? nextHeading
                : smoothAngleDeg(prev.headingDeg, nextHeading, 0.2);
          const smoothedPitch = lerp(prev.pitchDeg, nextPitch, 0.22);
          return {
            headingDeg: smoothedHeading,
            pitchDeg: smoothedPitch,
          };
        });
      };
      globalThis.addEventListener("deviceorientation", onOrientation, true);
      return () => {
        globalThis.removeEventListener("deviceorientation", onOrientation, true);
      };
    } catch {
      setOrientationError("Could not start orientation sensors.");
      return;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cleanupOrientation: (() => void) | undefined;
    requestOrientation().then((cleanup) => {
      cleanupOrientation = cleanup;
    });
    return () => {
      cleanupOrientation?.();
    };
  }, [open, requestOrientation]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    setCameraError(null);
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      })
      .then((stream) => {
        if (!active) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {
            setCameraError("Camera stream started, but autoplay is blocked.");
          });
        }
      })
      .catch(() => {
        setCameraError("Camera permission failed. Allow camera access and retry.");
      });
    return () => {
      active = false;
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const updateSize = () => {
      const box = overlayRef.current?.getBoundingClientRect();
      if (!box) {
        return;
      }
      setViewport({
        w: Math.max(1, Math.round(box.width)),
        h: Math.max(1, Math.round(box.height)),
      });
    };
    updateSize();
    globalThis.addEventListener("resize", updateSize);
    return () => {
      globalThis.removeEventListener("resize", updateSize);
    };
  }, [open]);

  return (
    <div className="border-t border-zinc-800/80 pt-2">
      <p className="text-[0.65rem] text-zinc-500">AR preview</p>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="mt-1 w-full rounded-md border border-blue-500/35 bg-blue-500/10 py-1.5 text-sm text-yellow-400/90"
      >
        Open AR sky overlay
      </button>
      <p className="mt-1 text-[0.6rem] leading-snug text-zinc-500">
        Shows live flight labels directly in camera view (selection optional).
      </p>
      {open ? (
        <div className="fixed inset-0 z-[320] bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
            autoPlay
          />
          <div
            ref={overlayRef}
            className="absolute inset-0 overflow-hidden"
          >
            <div className="absolute left-3 top-3 rounded-md border border-zinc-700/80 bg-black/65 px-2.5 py-2 font-[family-name:var(--font-jetbrains-mono)] text-[0.65rem] text-zinc-200 backdrop-blur">
              <p>Tracked: {trackedMarkers.length}</p>
              <p>Watched: {watchedFlightIds.size}</p>
              <p>Mode: {showAllNearbyFlights ? "All nearby" : "Focused"}</p>
              <p>
                Heading:{" "}
                {cameraAzimuthDeg == null ? "—" : `${cameraAzimuthDeg.toFixed(0)}°`}
              </p>
              <p>Pitch: {pose.pitchDeg.toFixed(0)}°</p>
            </div>
            <div className="absolute right-3 top-3 rounded-md border border-zinc-700/80 bg-black/65 px-2 py-2 text-zinc-200 backdrop-blur">
              <p className="mb-1 text-center font-[family-name:var(--font-jetbrains-mono)] text-[0.55rem] text-zinc-400">
                RADAR
              </p>
              <div className="relative h-20 w-20 rounded-full border border-zinc-600/80 bg-zinc-950/80">
                <div className="absolute left-1/2 top-1/2 h-[1px] w-[78%] -translate-x-1/2 -translate-y-1/2 bg-zinc-700/80" />
                <div className="absolute left-1/2 top-1/2 h-[78%] w-[1px] -translate-x-1/2 -translate-y-1/2 bg-zinc-700/80" />
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/75 bg-blue-500/25" />
                {radarBlips.map((blip) => (
                  <div
                    key={`radar-${blip.id}`}
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                      blip.isSelected ? "h-2.5 w-2.5 bg-yellow-300" : "h-2 w-2 bg-sky-300"
                    }`}
                    style={{
                      transform: `translate(calc(-50% + ${blip.x}px), calc(-50% + ${blip.y}px))`,
                    }}
                    title={blip.label}
                  />
                ))}
                <div className="pointer-events-none absolute left-1/2 top-1 h-0 w-0 -translate-x-1/2 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-yellow-400/95" />
              </div>
            </div>

            {markerScreen.map((marker) =>
              marker.isVisible ? (
                <div
                  key={marker.id}
                  className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${
                    marker.isSelected
                      ? "border-yellow-400/90 bg-yellow-400/20 text-yellow-300"
                      : "border-sky-400/80 bg-sky-500/15 text-sky-200"
                  }`}
                  style={{ left: marker.x, top: marker.y }}
                >
                  {marker.label}
                </div>
              ) : null
            )}

            {offscreenArrows.map((marker) => (
              <div
                key={`off-${marker.id}`}
                className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-0.5 text-[0.6rem] ${
                  marker.isSelected
                    ? "border-yellow-400/90 bg-yellow-400/20 text-yellow-200"
                    : "border-sky-400/80 bg-sky-500/15 text-sky-200"
                }`}
                style={{ left: marker.x, top: marker.y }}
                title={`${marker.label} is off-screen`}
              >
                <span
                  className="inline-block text-[0.7rem]"
                  style={{ transform: `rotate(${marker.angleDeg}deg)` }}
                >
                  ▲
                </span>{" "}
                {marker.label}
              </div>
            ))}

            {moonScreen?.visible ? (
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-lg text-yellow-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
                style={{ left: moonScreen.x, top: moonScreen.y }}
                title="Moon"
              >
                ○
              </div>
            ) : null}

            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAllNearbyFlights((prev) => !prev);
                }}
                className="rounded-md border border-zinc-600 bg-black/70 px-3 py-2 text-xs text-zinc-100 backdrop-blur"
              >
                {showAllNearbyFlights ? "Only focused flights" : "Show all nearby"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const headingDeg = pose.headingDeg;
                  if (headingDeg == null) {
                    return;
                  }
                  setCalibrationOffsetDeg((prev) =>
                    normalizeSignedAngleDeg(prev - headingDeg)
                  );
                }}
                className="rounded-md border border-zinc-600 bg-black/70 px-3 py-2 text-xs text-zinc-100 backdrop-blur"
              >
                Recenter heading
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                }}
                className="rounded-md border border-red-400/45 bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-100 backdrop-blur"
              >
                Close AR
              </button>
            </div>

            {cameraError || orientationError ? (
              <div className="absolute left-3 right-3 top-24 rounded-md border border-red-500/60 bg-black/75 px-3 py-2 text-xs text-red-200">
                {cameraError || orientationError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
