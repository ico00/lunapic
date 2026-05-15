"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { MoonState } from "@/types/moon";
import type { GroundObserver } from "@/types";
import { buildMoonPathSamplesInTimeRange } from "@/lib/domain/astro/astroService";

declare global {
  interface Window {
    google: typeof google;
    initStreetViewPanorama: () => void;
  }
}

type Props = {
  moon: MoonState | null;
  observer: GroundObserver;
  nowMs: number;
};

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const HFOV_DEG = 90; // Google Street View horizontal FOV at zoom=0
const PATH_STEP_MS = 10 * 60 * 1000; // 10-minute samples
const PATH_WINDOW_MS = 4 * 60 * 60 * 1000; // ±4 hours

function loadGoogleMapsScript(onLoad: () => void) {
  if (typeof window === "undefined") return;
  if (window.google?.maps?.StreetViewPanorama) {
    onLoad();
    return;
  }
  if (document.getElementById("gm-sv-script")) {
    const prev = window.initStreetViewPanorama;
    window.initStreetViewPanorama = () => { prev?.(); onLoad(); };
    return;
  }
  window.initStreetViewPanorama = onLoad;
  const script = document.createElement("script");
  script.id = "gm-sv-script";
  script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=initStreetViewPanorama`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

/**
 * Project (azimuthDeg, altitudeDeg) onto canvas pixel coordinates given the
 * current Street View POV (heading, pitch) and canvas size.
 * Uses a proper perspective projection from spherical coordinates.
 * Returns null when the point is behind the viewer or outside the canvas.
 */
function project(
  azDeg: number,
  altDeg: number,
  povH: number,
  povP: number,
  W: number,
  H: number,
): [number, number] | null {
  const toRad = Math.PI / 180;
  const az = azDeg * toRad;
  const alt = altDeg * toRad;
  const vH = povH * toRad;
  const vP = povP * toRad;

  // Point on unit sphere (East-North-Up convention)
  const px = Math.sin(az) * Math.cos(alt);
  const py = Math.cos(az) * Math.cos(alt);
  const pz = Math.sin(alt);

  // Camera forward vector
  const fx = Math.sin(vH) * Math.cos(vP);
  const fy = Math.cos(vH) * Math.cos(vP);
  const fz = Math.sin(vP);

  // Camera right vector (always horizontal)
  const rx = Math.cos(vH);
  const ry = -Math.sin(vH);
  const rz = 0;

  // Camera up vector = cross(right, forward)
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  // Project point into camera space
  const depth = px * fx + py * fy + pz * fz;
  if (depth <= 0.01) return null; // behind or on edge of view

  const camR = px * rx + py * ry + pz * rz;
  const camU = px * ux + py * uy + pz * uz;

  // Perspective focal length from HFOV
  const f = (W / 2) / Math.tan((HFOV_DEG / 2) * toRad);

  const sx = W / 2 + (camR / depth) * f;
  const sy = H / 2 - (camU / depth) * f;

  if (sx < -W || sx > 2 * W || sy < -H || sy > 2 * H) return null;
  return [sx, sy];
}

export function StreetViewPanel({ moon, observer, nowMs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [pov, setPov] = useState<{ heading: number; pitch: number }>({ heading: 0, pitch: 0 });

  const moonAz = moon?.azimuthDeg ?? 0;
  const moonAlt = moon?.altitudeDeg ?? 0;

  // Moon path ±4h around nowMs at 10-min steps
  const pathSamples = useMemo(() => {
    return buildMoonPathSamplesInTimeRange(
      nowMs - PATH_WINDOW_MS,
      nowMs + PATH_WINDOW_MS,
      PATH_STEP_MS,
      observer.lat,
      observer.lng,
    );
  }, [nowMs, observer.lat, observer.lng]);

  useEffect(() => {
    loadGoogleMapsScript(() => setApiReady(true));
  }, []);

  // Build panorama once observer changes
  useEffect(() => {
    if (!apiReady || !containerRef.current) return;

    setStatus("loading");
    const latLng = { lat: observer.lat, lng: observer.lng };
    const svService = new window.google.maps.StreetViewService();

    svService.getPanorama(
      {
        location: latLng,
        radius: 100,
        preference: window.google.maps.StreetViewPreference.NEAREST,
      },
      (data, svStatus) => {
        if (
          svStatus !== window.google.maps.StreetViewStatus.OK ||
          !data?.location?.latLng ||
          !containerRef.current
        ) {
          setStatus("unavailable");
          return;
        }

        const initialPov = { heading: moonAz, pitch: Math.max(moonAlt, 5) };
        const pano = new window.google.maps.StreetViewPanorama(containerRef.current, {
          position: data.location.latLng,
          pov: initialPov,
          zoom: 0,
          addressControl: false,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
          showRoadLabels: false,
          linksControl: false,
        });

        panoRef.current = pano;
        setPov(initialPov);
        setStatus("ready");

        // Track POV changes so canvas redraws on drag
        pano.addListener("pov_changed", () => {
          const p = pano.getPov();
          setPov({ heading: p.heading ?? 0, pitch: p.pitch ?? 0 });
        });
      }
    );

    return () => {
      panoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, observer.lat, observer.lng]);

  // Aim panorama at moon when moon moves (timeline drag)
  useEffect(() => {
    if (!panoRef.current || status !== "ready") return;
    const newPov = { heading: moonAz, pitch: Math.max(moonAlt, 5) };
    panoRef.current.setPov(newPov);
  }, [moonAz, moonAlt, status]);

  // Draw canvas overlay whenever POV or moon data changes
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || status !== "ready") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const povH = pov.heading;
    const povP = pov.pitch;

    // --- Draw moon path ---
    // Past: dim amber dots; Future: brighter amber dots; Current: bright
    for (let i = 0; i < pathSamples.length; i++) {
      const s = pathSamples[i];
      const pt = project(s.azimuthDeg, s.altitudeDeg, povH, povP, W, H);
      if (!pt) continue;

      const isPast = s.epochMs < nowMs;
      const isCurrent = Math.abs(s.epochMs - nowMs) < PATH_STEP_MS;
      const alpha = isPast ? 0.3 : 0.75;
      const radius = isCurrent ? 5 : 3;

      ctx.beginPath();
      ctx.arc(pt[0], pt[1], radius, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent
        ? `rgba(251, 191, 36, 1)`
        : isPast
        ? `rgba(251, 191, 36, ${alpha})`
        : `rgba(255, 220, 100, ${alpha})`;
      ctx.fill();
    }

    // --- Draw moon disk ---
    const moonPt = project(moonAz, moonAlt, povH, povP, W, H);
    if (moonPt) {
      const [mx, my] = moonPt;
      const R = 22;

      // Outer glow
      const grad = ctx.createRadialGradient(mx, my, R * 0.5, mx, my, R * 2.2);
      grad.addColorStop(0, "rgba(251,191,36,0.45)");
      grad.addColorStop(1, "rgba(251,191,36,0)");
      ctx.beginPath();
      ctx.arc(mx, my, R * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Moon disk fill
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(251, 191, 36, 0.18)";
      ctx.fill();

      // Moon disk border
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crosshair lines
      ctx.strokeStyle = "rgba(251, 191, 36, 0.6)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mx - R * 1.8, my);
      ctx.lineTo(mx + R * 1.8, my);
      ctx.moveTo(mx, my - R * 1.8);
      ctx.lineTo(mx, my + R * 1.8);
      ctx.stroke();
      ctx.setLineDash([]);

      // "Moon" label
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = "rgba(251, 191, 36, 0.95)";
      ctx.textAlign = "center";
      ctx.fillText("☽ Moon", mx, my + R + 14);
    }

    // --- Horizon hint if moon is below canvas ---
    if (moonAlt < 0) {
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillStyle = "rgba(251,191,36,0.6)";
      ctx.textAlign = "center";
      ctx.fillText("Moon below horizon", W / 2, H - 16);
    }
  }, [pov, pathSamples, moonAz, moonAlt, nowMs, status]);

  useEffect(() => {
    const id = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(id);
  }, [drawCanvas]);

  return (
    <div className="flex flex-col gap-3">
      {/* Info row */}
      <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-[color:var(--t-tertiary)]">
        <span>
          Az <span className="text-amber-300">{moonAz.toFixed(1)}°</span>
          {" · "}
          Alt <span className="text-amber-300">{moonAlt.toFixed(1)}°</span>
        </span>
        {moon && (
          <span className="text-[color:var(--t-secondary)]">
            {moon.illuminationFraction < 0.01
              ? "New Moon"
              : `${(moon.illuminationFraction * 100).toFixed(0)}% lit`}
          </span>
        )}
      </div>

      {/* Panorama + canvas overlay */}
      <div className="relative overflow-hidden rounded-2xl" style={{ height: 340 }}>
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-400" />
              <span className="text-xs text-zinc-400">Loading Street View…</span>
            </div>
          </div>
        )}

        {status === "unavailable" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-zinc-900/90 z-10">
            <div className="text-center">
              <div className="mb-1 text-2xl">📍</div>
              <p className="text-sm font-medium text-zinc-300">Street View unavailable</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                No panorama within 100 m of this location
              </p>
            </div>
          </div>
        )}

        {/* Street View container */}
        <div ref={containerRef} className="h-full w-full" />

        {/* Canvas overlay — above Google Maps internal z-indices, pointer-events:none preserves panorama drag */}
        <canvas
          ref={canvasRef}
          width={380}
          height={340}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 9999 }}
        />
      </div>

      <p className="text-center text-[11px] text-[color:var(--t-tertiary)]">
        Drag to explore · dots = Moon path ±4 h · circle = now
      </p>
    </div>
  );
}
