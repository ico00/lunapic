"use client";

import { useMoonStateComputed, useTransitCandidates } from "@/hooks/useTransitCandidates";
import { mpsToKnots } from "@/lib/format/numbers";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import type { FlightState } from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TrackedMarker = {
  id: string;
  label: string;
  azimuthDeg: number;
  altitudeDeg: number;
  isSelected: boolean;
  flight: FlightState;
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
    flight,
  };
}

function formatMaybeNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) {
    return "—";
  }
  return n.toFixed(digits);
}

export function ArSkyCameraPanel() {
  const observer = useObserverStore((s) => s.observer);
  const flights = useMoonTransitStore((s) => s.flights);
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const setSelectedFlightId = useMoonTransitStore((s) => s.setSelectedFlightId);
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
  const [infoFlightId, setInfoFlightId] = useState<string | null>(null);

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

  useEffect(() => {
    if (infoFlightId != null && !trackedMarkers.some((m) => m.id === infoFlightId)) {
      setInfoFlightId(null);
    }
  }, [infoFlightId, trackedMarkers]);

  const infoMarker = useMemo(
    () => trackedMarkers.find((marker) => marker.id === infoFlightId) ?? null,
    [infoFlightId, trackedMarkers]
  );

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
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-1.5 text-sm font-medium text-emerald-100"
      >
        Open AR sky overlay
      </button>
      <p className="mt-2 text-[length:var(--fs-meta)] leading-snug text-[color:var(--t-tertiary)]">
        Shows traffic in the camera view. Tap an aircraft label for details.
      </p>
      {open ? createPortal(
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
            {/* Info kartica gore — prikazuje se samo kad korisnik tapne callsign */}
            {infoMarker ? (
              <div className="absolute left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-2xl border border-white/[0.14] bg-black/80 px-3 py-2.5 text-zinc-100 backdrop-blur-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-amber-300 leading-tight">
                      {infoMarker.label}
                    </p>
                    <p className="text-[length:var(--fs-label)] text-[color:var(--t-tertiary)] truncate">
                      {infoMarker.flight.aircraftType?.trim() || "—"} · {infoMarker.flight.icao24 || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInfoFlightId(null)}
                    className="shrink-0 rounded-full border border-white/[0.15] bg-white/[0.08] px-2 py-0.5 text-[length:var(--fs-label)] text-[color:var(--t-secondary)]"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[length:var(--fs-label)] text-[color:var(--t-secondary)]">
                  <p>Alt: {formatMaybeNumber(infoMarker.flight.baroAltitudeMeters ?? infoMarker.flight.geoAltitudeMeters, 0)} m</p>
                  <p>GS: {infoMarker.flight.groundSpeedMps != null ? `${formatMaybeNumber(mpsToKnots(infoMarker.flight.groundSpeedMps), 0)} kt` : "—"}</p>
                  <p>Track: {formatMaybeNumber(infoMarker.flight.trackDeg, 0)}°</p>
                  <p>Sky: {formatMaybeNumber(infoMarker.azimuthDeg, 0)}° / {formatMaybeNumber(infoMarker.altitudeDeg, 1)}°</p>
                </div>
              </div>
            ) : null}

            {markerScreen.map((marker) =>
              marker.isVisible ? (
                <button
                  key={marker.id}
                  type="button"
                  onClick={() => {
                    setInfoFlightId(marker.id);
                    setSelectedFlightId(marker.id);
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[length:var(--fs-label)] font-semibold ${
                    marker.isSelected
                      ? "border-amber-400/90 bg-amber-400/20 text-amber-300"
                      : "border-sky-400/80 bg-sky-500/15 text-sky-200"
                  }`}
                  style={{ left: marker.x, top: marker.y }}
                >
                  {marker.label}
                </button>
              ) : null
            )}

            {offscreenArrows.map((marker) => (
              <button
                key={`off-${marker.id}`}
                type="button"
                onClick={() => {
                  setInfoFlightId(marker.id);
                  setSelectedFlightId(marker.id);
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-0.5 text-[length:var(--fs-label)] ${
                  marker.isSelected
                    ? "border-amber-400/90 bg-amber-400/20 text-amber-200"
                    : "border-sky-400/80 bg-sky-500/15 text-sky-200"
                }`}
                style={{ left: marker.x, top: marker.y }}
              >
                <span
                  className="inline-block text-[0.7rem]"
                  style={{ transform: `rotate(${marker.angleDeg}deg)` }}
                >
                  ▲
                </span>{" "}
                {marker.label}
              </button>
            ))}

            {moonScreen?.visible ? (
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-lg text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
                style={{ left: moonScreen.x, top: moonScreen.y }}
              >
                ○
              </div>
            ) : null}

            {/* Kompas — dolje desno */}
            <div className="absolute bottom-16 right-3 flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.18] bg-black/65 backdrop-blur-md">
              <div
                className="relative flex h-full w-full items-center justify-center"
                style={{
                  transform: cameraAzimuthDeg != null
                    ? `rotate(${-cameraAzimuthDeg}deg)`
                    : undefined,
                }}
              >
                <span className="absolute top-1 text-[0.5rem] font-bold text-amber-300">N</span>
                <span className="absolute bottom-1 text-[0.45rem] text-zinc-400">S</span>
                <span className="absolute left-1 text-[0.45rem] text-zinc-400">W</span>
                <span className="absolute right-1 text-[0.45rem] text-zinc-400">E</span>
                <div className="h-5 w-[2px] rounded-full bg-gradient-to-b from-amber-300 to-zinc-600" />
              </div>
            </div>

            {/* Kontrole dole */}
            <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllNearbyFlights((prev) => !prev)}
                className="flex-1 rounded-xl border border-white/[0.12] bg-black/70 px-2 py-2 text-xs text-zinc-100 backdrop-blur-md"
              >
                {showAllNearbyFlights ? "Only focused" : "All nearby"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pose.headingDeg == null) return;
                  setCalibrationOffsetDeg((prev) =>
                    normalizeSignedAngleDeg(prev - pose.headingDeg!)
                  );
                }}
                className="flex-1 rounded-xl border border-white/[0.12] bg-black/70 px-2 py-2 text-xs text-zinc-100 backdrop-blur-md"
              >
                Recenter
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-rose-400/45 bg-rose-500/20 px-2 py-2 text-xs font-semibold text-rose-100 backdrop-blur-md"
              >
                Close AR
              </button>
            </div>

            {cameraError || orientationError ? (
              <div className="absolute left-3 right-3 top-24 rounded-2xl border border-rose-500/50 bg-black/80 px-3 py-2 text-xs text-rose-200 backdrop-blur-md">
                {cameraError || orientationError}
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
