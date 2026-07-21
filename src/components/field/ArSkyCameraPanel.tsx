"use client";

import { useTransitCandidates } from "@/hooks/useTransitCandidates";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { SelectedAircraftPopupContent } from "@/components/map/SelectedAircraftPopupContent";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { AstroService } from "@/lib/domain/astro/astroService";
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
  compassAccuracyDeg: number | null; // null = not reported; iOS: degrees of error
};

const MAX_TRACKED_MARKERS = 24;
const AR_H_FOV_DEG = 62;

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
  // beta=90°  → phone upright  → camera horizontal → pitch=0°
  // beta=180° → phone flat screen-down → camera pointing UP → pitch=+90°
  // beta=0°   → phone flat screen-up   → camera pointing DOWN → pitch=-90°
  // Back camera faces the same direction as the back of the phone:
  // tilting up (screen goes face-down) increases beta, so pitch = beta - 90.
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


export function ArSkyCameraPanel() {
  const observer = useObserverStore((s) => s.observer);
  const flights = useMoonTransitStore((s) => s.flights);
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const setSelectedFlightId = useMoonTransitStore((s) => s.setSelectedFlightId);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const openSkyLatencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const candidates = useTransitCandidates();

  const [open, setOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [orientationError, setOrientationError] = useState<string | null>(null);
  const [pose, setPose] = useState<DevicePose>({ headingDeg: null, pitchDeg: 0, compassAccuracyDeg: null });
  const [calibrationOffsetDeg, setCalibrationOffsetDeg] = useState(0);
  const [calibrating, setCalibrating] = useState(false);
  const [renderNowMs, setRenderNowMs] = useState(() => Date.now());

  // AR kamera uvijek prikazuje REALNI TRENUTAK — koristimo renderNowMs, ne referenceEpochMs.
  // Korisnik može imati vremenski klizač pomaknut na +20h, ali kamera vidi sadašnjost.
  // Preračunavamo svako 10 s — Mjesec se miče ~0.5°/h, čestije je nepotrebno.
  const moon = useMemo(
    () => AstroService.getMoonState(new Date(renderNowMs), observer.lat, observer.lng, observer.groundHeightMeters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Math.floor(renderNowMs / 10_000), observer.lat, observer.lng, observer.groundHeightMeters]
  );
  const [viewport, setViewport] = useState({ w: 360, h: 640 });
  const [showAllNearbyFlights, setShowAllNearbyFlights] = useState(true);
  const [infoFlightId, setInfoFlightId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const headingSamplesRef = useRef(0);

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


  const trackedMarkers = useMemo(() => {
    const byId = new Map(flights.map((f) => [f.id, f] as const));
    const ids = new Set<string>();
    const orderedIds: string[] = [];
    if (selectedFlightId) {
      ids.add(selectedFlightId);
      orderedIds.push(selectedFlightId);
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
      .filter((marker) => marker.altitudeDeg >= 0)
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
  ]);

  const newestFlightMs = useMemo(
    () => (trackedMarkers.length === 0 ? 0 : Math.max(...trackedMarkers.map((m) => m.flight.timestamp))),
    [trackedMarkers]
  );

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
    const horizontalFovDeg = AR_H_FOV_DEG;
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
              ? 0
              : 180;
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
    const horizontalFovDeg = AR_H_FOV_DEG;
    const verticalFovDeg = 48;
    const dxDeg = normalizeSignedAngleDeg(moon.azimuthDeg - cameraAzimuthDeg);
    const dyDeg = moon.altitudeDeg - pose.pitchDeg;
    const x = viewport.w * (0.5 + dxDeg / horizontalFovDeg);
    const y = viewport.h * (0.5 - dyDeg / verticalFovDeg);
    const visible = x >= -40 && x <= viewport.w + 40 && y >= -40 && y <= viewport.h + 40;
    return { x, y, dxDeg, dyDeg, visible };
  }, [cameraAzimuthDeg, moon.altitudeDeg, moon.azimuthDeg, pose.pitchDeg, viewport.h, viewport.w]);

  const moonOffscreenArrow = useMemo(() => {
    if (!moonScreen || moonScreen.visible) {
      return null;
    }
    const clampedX = Math.min(viewport.w - 20, Math.max(20, moonScreen.x));
    const clampedY = Math.min(viewport.h - 20, Math.max(20, moonScreen.y));
    const angleDeg =
      Math.abs(moonScreen.dxDeg) >= Math.abs(moonScreen.dyDeg)
        ? moonScreen.dxDeg > 0
          ? 90
          : -90
        : moonScreen.dyDeg > 0
          ? 0
          : 180;
    return { x: clampedX, y: clampedY, angleDeg };
  }, [moonScreen, viewport.h, viewport.w]);

  const handleCalibrationTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!calibrating || pose.headingDeg == null) return;
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const tapX = e.clientX - rect.left;
      // Horizontal angle between the tap position and the current camera center
      const tapDxDeg = (tapX / viewport.w - 0.5) * AR_H_FOV_DEG;
      // We want moon to appear at tapX, so we solve for the new calibrationOffset:
      // moon.azimuthDeg = pose.headingDeg + newOffset + tapDxDeg  (mod 360)
      const newOffset = normalizeSignedAngleDeg(moon.azimuthDeg - pose.headingDeg - tapDxDeg);
      setCalibrationOffsetDeg(newOffset);
      setCalibrating(false);
    },
    [calibrating, moon.azimuthDeg, pose.headingDeg, viewport.w]
  );

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
          webkitCompassAccuracy?: number;
        };
        const nextHeading =
          typeof webkitEvent.webkitCompassHeading === "number"
            ? webkitEvent.webkitCompassHeading % 360
            : event.alpha == null
              ? null
              : (360 - event.alpha + 360) % 360;
        const nextAccuracy =
          typeof webkitEvent.webkitCompassAccuracy === "number" &&
          webkitEvent.webkitCompassAccuracy >= 0
            ? webkitEvent.webkitCompassAccuracy
            : null;
        const nextPitch = toCameraPitchDeg(event.beta);
        setPose((prev) => {
          const smoothedHeading = (() => {
            if (nextHeading == null) return null;
            if (prev.headingDeg == null) {
              headingSamplesRef.current = 1;
              return nextHeading;
            }
            // Reject outliers: a jump >45° in one sensor sample is a magnetic
            // glitch, not real rotation (~6°/frame max at 360°/s, 60 Hz).
            const delta = normalizeSignedAngleDeg(nextHeading - prev.headingDeg);
            if (Math.abs(delta) > 45) return prev.headingDeg;
            // Warmup: high alpha for first ~60 samples (~1 s) for fast initial
            // lock-on, then low alpha for long-term stability.
            const n = headingSamplesRef.current;
            headingSamplesRef.current = n + 1;
            const alpha = n < 60 ? 0.25 : 0.06;
            return smoothAngleDeg(prev.headingDeg, nextHeading, alpha);
          })();
          const smoothedPitch = lerp(prev.pitchDeg, nextPitch, 0.12);
          return {
            headingDeg: smoothedHeading,
            pitchDeg: smoothedPitch,
            compassAccuracyDeg: nextAccuracy,
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
    headingSamplesRef.current = 0;
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
        className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-1.5 text-[length:var(--fs-meta)] font-medium text-emerald-100"
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
            className={`absolute inset-0 overflow-hidden${calibrating ? " cursor-crosshair" : ""}`}
            onClick={calibrating ? handleCalibrationTap : undefined}
          >
            {/* Uputa za kalibraciju — prikazuje se samo kad je calibrating=true */}
            {calibrating && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 px-6">
                <div className="rounded-2xl border border-amber-400/60 bg-black/85 px-4 py-3 text-center text-[length:var(--fs-meta)] font-semibold text-amber-200 backdrop-blur-md">
                  Tapni gdje stvarno vidiš Mjesec u kameri
                </div>
                <div className="text-3xl opacity-60 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">+</div>
              </div>
            )}

            {/* Info kartica gore — prikazuje se samo kad korisnik tapne callsign */}
            {!calibrating && infoMarker ? (
              <div className="absolute left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-[var(--r-xl)] border border-white/[0.14] bg-black/80 backdrop-blur-md overflow-hidden">
                <SelectedAircraftPopupContent
                  flight={infoMarker.flight}
                  onDismiss={() => setInfoFlightId(null)}
                />
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
                  {marker.label} <span className="opacity-70">+{marker.altitudeDeg.toFixed(0)}°</span>
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
                {marker.label} <span className="opacity-60">+{marker.altitudeDeg.toFixed(0)}°</span>
              </button>
            ))}

            {moonScreen?.visible ? (
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
                style={{ left: moonScreen.x, top: moonScreen.y }}
              >
                <span className="text-2xl leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                  ○
                </span>
                <span className="rounded border border-amber-400/60 bg-black/60 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-amber-300 backdrop-blur-sm">
                  Moon
                </span>
              </div>
            ) : null}

            {moonOffscreenArrow ? (
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
                style={{ left: moonOffscreenArrow.x, top: moonOffscreenArrow.y }}
              >
                <span
                  className="text-[length:var(--fs-body-strong)] leading-none text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                  style={{ transform: `rotate(${moonOffscreenArrow.angleDeg}deg)` }}
                >
                  ▲
                </span>
                <span className="rounded border border-amber-400/60 bg-black/60 px-1 py-0.5 text-[0.55rem] font-semibold text-amber-300 backdrop-blur-sm">
                  Moon
                </span>
              </div>
            ) : null}

            {/* Dijagnostički red — kurs, nagib, starost podataka */}
            <div className="absolute bottom-[calc(4rem+2.5rem+0.5rem)] left-3 right-3 flex items-center justify-between gap-1 rounded-xl border border-white/[0.08] bg-black/55 px-2 py-1 text-[0.5rem] font-mono text-[color:var(--t-secondary)] backdrop-blur-sm">
              <span>
                {cameraAzimuthDeg != null
                  ? `↑ ${Math.round(cameraAzimuthDeg)}°`
                  : "↑ –"}
              </span>
              <span>
                {`∠ ${pose.pitchDeg >= 0 ? "+" : ""}${Math.round(pose.pitchDeg)}°`}
              </span>
              <span>
                {newestFlightMs > 0
                  ? Math.round((renderNowMs - newestFlightMs) / 1000) < 120
                    ? <span className="text-emerald-400">{Math.round((renderNowMs - newestFlightMs) / 1000)}s</span>
                    : <span className="text-rose-300">{Math.round((renderNowMs - newestFlightMs) / 60000)}m staro</span>
                  : "–"}
              </span>
              <span className="text-[color:var(--t-tertiary)]">
                {`☽ ${Math.round(moon.azimuthDeg)}°/${Math.round(moon.altitudeDeg)}°`}
              </span>
            </div>

            {/* Kompas — dolje desno */}
            <div className="absolute bottom-16 right-3 flex flex-col items-center gap-1">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.18] bg-black/65 backdrop-blur-md">
                <div
                  className="relative flex h-full w-full items-center justify-center"
                  style={{
                    transform: cameraAzimuthDeg != null
                      ? `rotate(${-cameraAzimuthDeg}deg)`
                      : undefined,
                  }}
                >
                  <span className="absolute top-1 text-[0.5rem] font-bold text-amber-300">N</span>
                  <span className="absolute bottom-1 text-[0.45rem] text-[color:var(--t-tertiary)]">S</span>
                  <span className="absolute left-1 text-[0.45rem] text-[color:var(--t-tertiary)]">W</span>
                  <span className="absolute right-1 text-[0.45rem] text-[color:var(--t-tertiary)]">E</span>
                  <div className="h-5 w-[2px] rounded-full bg-gradient-to-b from-amber-300 to-zinc-600" />
                </div>
              </div>
              {/* Accuracy badge — shows compass reliability */}
              {pose.compassAccuracyDeg != null && (
                <span
                  className={`rounded px-1 py-0.5 text-[0.5rem] font-semibold leading-none backdrop-blur-sm ${
                    pose.compassAccuracyDeg <= 10
                      ? "border border-emerald-500/50 bg-black/60 text-emerald-400"
                      : pose.compassAccuracyDeg <= 20
                        ? "border border-amber-400/60 bg-black/60 text-amber-300"
                        : "border border-rose-500/60 bg-black/70 text-rose-300"
                  }`}
                >
                  ±{Math.round(pose.compassAccuracyDeg)}°
                </span>
              )}
            </div>

            {/* Compass interference warning — hidden when aircraft info card is open */}
            {!infoMarker && pose.compassAccuracyDeg != null && pose.compassAccuracyDeg > 15 && (
              <div className="absolute left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] mt-1 rounded-2xl border border-rose-500/50 bg-black/80 px-3 py-2 text-[length:var(--fs-label)] text-rose-200 backdrop-blur-md">
                ⚠️ Kompas netočan (±{Math.round(pose.compassAccuracyDeg)}°) — magnetska smetnja. Udalji se od metalnih konstrukcija radi točnog AR prikaza.
              </div>
            )}

            {/* Kontrole dole */}
            <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllNearbyFlights((prev) => !prev)}
                className="flex-1 rounded-xl border border-white/[0.12] bg-black/70 px-2 py-2 text-[length:var(--fs-label)] text-[color:var(--t-primary)] backdrop-blur-md"
              >
                {showAllNearbyFlights ? "Only focused" : "All nearby"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (calibrating) {
                    setCalibrating(false);
                  } else if (calibrationOffsetDeg !== 0) {
                    setCalibrationOffsetDeg(0);
                    setCalibrating(false);
                  } else {
                    setCalibrating(true);
                  }
                }}
                className={`flex-1 rounded-xl border px-2 py-2 text-[length:var(--fs-label)] font-semibold backdrop-blur-md ${
                  calibrating
                    ? "border-amber-400/70 bg-amber-500/20 text-amber-200"
                    : calibrationOffsetDeg !== 0
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                      : "border-white/[0.12] bg-black/70 text-[color:var(--t-primary)]"
                }`}
              >
                {calibrating ? "Odustani" : calibrationOffsetDeg !== 0 ? `Cal ${calibrationOffsetDeg > 0 ? "+" : ""}${Math.round(calibrationOffsetDeg)}°` : "Cal ☽"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-rose-400/45 bg-rose-500/20 px-2 py-2 text-[length:var(--fs-label)] font-semibold text-rose-100 backdrop-blur-md"
              >
                Close AR
              </button>
            </div>

            {cameraError || orientationError ? (
              <div className="absolute left-3 right-3 top-24 rounded-2xl border border-rose-500/50 bg-black/80 px-3 py-2 text-[length:var(--fs-label)] text-rose-200 backdrop-blur-md">
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
