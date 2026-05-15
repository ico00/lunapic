"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { MoonState } from "@/types/moon";
import type { GroundObserver } from "@/types";
import type { TransitCandidate } from "@/types/transit";
import type { ActiveTransitRow } from "@/hooks/useActiveTransits";
import { buildMoonPathSamplesInTimeRange } from "@/lib/domain/astro/astroService";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";

declare global {
  interface Window {
    google: typeof google;
    initStreetViewPanoramaFull: () => void;
  }
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const HFOV_DEG = 90;
const PATH_STEP_MS = 10 * 60 * 1000;
const PATH_WINDOW_MS = 4 * 60 * 60 * 1000;

function loadGoogleMapsScript(onLoad: () => void) {
  if (typeof window === "undefined") return;
  if (window.google?.maps?.StreetViewPanorama) { onLoad(); return; }
  if (document.getElementById("gm-sv-script")) {
    const prev = window.initStreetViewPanoramaFull;
    window.initStreetViewPanoramaFull = () => { prev?.(); onLoad(); };
    return;
  }
  window.initStreetViewPanoramaFull = onLoad;
  const script = document.createElement("script");
  script.id = "gm-sv-script";
  script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=initStreetViewPanoramaFull`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

function project(
  azDeg: number, altDeg: number,
  povH: number, povP: number,
  W: number, H: number,
): [number, number] | null {
  const r = Math.PI / 180;
  const px = Math.sin(azDeg * r) * Math.cos(altDeg * r);
  const py = Math.cos(azDeg * r) * Math.cos(altDeg * r);
  const pz = Math.sin(altDeg * r);
  const fx = Math.sin(povH * r) * Math.cos(povP * r);
  const fy = Math.cos(povH * r) * Math.cos(povP * r);
  const fz = Math.sin(povP * r);
  const rx = Math.cos(povH * r);
  const ry = -Math.sin(povH * r);
  const ux = ry * fz - 0;
  const uy = -rx * fz;
  const uz = rx * fy - ry * fx;
  const depth = px * fx + py * fy + pz * fz;
  if (depth <= 0.01) return null;
  const camR = px * rx + py * ry;
  const camU = px * ux + py * uy + pz * uz;
  const f = (W / 2) / Math.tan((HFOV_DEG / 2) * r);
  const sx = W / 2 + (camR / depth) * f;
  const sy = H / 2 - (camU / depth) * f;
  if (sx < -W || sx > 2 * W || sy < -H || sy > 2 * H) return null;
  return [sx, sy];
}

type Props = {
  moon: MoonState | null;
  observer: GroundObserver;
  nowMs: number;
  candidates: readonly TransitCandidate[];
  activeTransits: readonly ActiveTransitRow[];
};

export function StreetViewFullscreen({ moon, observer, nowMs, candidates, activeTransits }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [pov, setPov] = useState<{ heading: number; pitch: number }>({ heading: 0, pitch: 0 });
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  const moonAz = moon?.azimuthDeg ?? 0;
  const moonAlt = moon?.altitudeDeg ?? 0;

  // Track container size for pixel-perfect canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setCanvasSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pathSamples = useMemo(() =>
    buildMoonPathSamplesInTimeRange(
      nowMs - PATH_WINDOW_MS, nowMs + PATH_WINDOW_MS, PATH_STEP_MS,
      observer.lat, observer.lng,
    ), [nowMs, observer.lat, observer.lng]);

  useEffect(() => { loadGoogleMapsScript(() => setApiReady(true)); }, []);

  useEffect(() => {
    if (!apiReady || !containerRef.current) return;
    setStatus("loading");
    const svService = new window.google.maps.StreetViewService();
    svService.getPanorama(
      { location: { lat: observer.lat, lng: observer.lng }, radius: 100,
        preference: window.google.maps.StreetViewPreference.NEAREST },
      (data, svStatus) => {
        if (svStatus !== window.google.maps.StreetViewStatus.OK || !data?.location?.latLng || !containerRef.current) {
          setStatus("unavailable"); return;
        }
        const initialPov = { heading: moonAz, pitch: Math.max(moonAlt, 5) };
        const pano = new window.google.maps.StreetViewPanorama(containerRef.current, {
          position: data.location.latLng,
          pov: initialPov, zoom: 0,
          addressControl: false, fullscreenControl: false,
          motionTracking: false, motionTrackingControl: false,
          showRoadLabels: false, linksControl: false,
        });
        panoRef.current = pano;
        setPov(initialPov);
        setStatus("ready");
        pano.addListener("pov_changed", () => {
          const p = pano.getPov();
          setPov({ heading: p.heading ?? 0, pitch: p.pitch ?? 0 });
        });
      }
    );
    return () => { panoRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, observer.lat, observer.lng]);

  useEffect(() => {
    if (!panoRef.current || status !== "ready") return;
    panoRef.current.setPov({ heading: moonAz, pitch: Math.max(moonAlt, 5) });
  }, [moonAz, moonAlt, status]);

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

    // Moon path
    for (const s of pathSamples) {
      const pt = project(s.azimuthDeg, s.altitudeDeg, povH, povP, W, H);
      if (!pt) continue;
      const isPast = s.epochMs < nowMs;
      const isCurrent = Math.abs(s.epochMs - nowMs) < PATH_STEP_MS;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], isCurrent ? 7 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? "rgba(251,191,36,1)"
        : isPast ? "rgba(251,191,36,0.3)" : "rgba(255,220,100,0.75)";
      ctx.fill();
    }

    // Moon disk
    const moonPt = project(moonAz, moonAlt, povH, povP, W, H);
    if (moonPt) {
      const [mx, my] = moonPt;
      const R = 32;
      const grad = ctx.createRadialGradient(mx, my, R * 0.5, mx, my, R * 2.5);
      grad.addColorStop(0, "rgba(251,191,36,0.5)");
      grad.addColorStop(1, "rgba(251,191,36,0)");
      ctx.beginPath(); ctx.arc(mx, my, R * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(251,191,36,0.18)"; ctx.fill();
      ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(251,191,36,0.95)"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = "rgba(251,191,36,0.55)"; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(mx - R * 2, my); ctx.lineTo(mx + R * 2, my);
      ctx.moveTo(mx, my - R * 2); ctx.lineTo(mx, my + R * 2);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.font = "bold 13px ui-monospace, monospace";
      ctx.fillStyle = "rgba(251,191,36,0.95)"; ctx.textAlign = "center";
      ctx.fillText("☽ Moon", mx, my + R + 18);
    }

    // Aircraft
    const activeIds = new Set(activeTransits.map((t) => t.flight.id));
    const drawFlight = (
      flight: { id: string; callSign?: string | null; icao24?: string; position: { lat: number; lng: number }; geoAltitudeMeters: number | null; baroAltitudeMeters: number | null },
      isActive: boolean,
    ) => {
      const h = flight.geoAltitudeMeters ?? flight.baroAltitudeMeters;
      if (h == null) return;
      const dir = horizontalToPoint(observer, flight.position.lat, flight.position.lng, h);
      const pt = project(dir.azimuthDeg, dir.altitudeDeg, povH, povP, W, H);
      if (!pt) return;
      const [ax, ay] = pt;
      const label = flight.callSign?.trim() || flight.icao24 || "?";
      const altFt = Math.round(h * 3.28084 / 100) * 100;
      if (isActive) {
        ctx.shadowColor = "rgba(56,189,248,0.9)"; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(ax, ay, 14, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(56,189,248,0.2)"; ctx.fill();
        ctx.beginPath(); ctx.arc(ax, ay, 14, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(56,189,248,1)"; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = "bold 16px serif"; ctx.fillStyle = "rgba(56,189,248,1)";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("✈", ax, ay); ctx.textBaseline = "alphabetic";
        ctx.font = "bold 12px ui-monospace, monospace"; ctx.fillStyle = "rgba(56,189,248,1)";
        ctx.fillText(label, ax, ay + 24);
        ctx.font = "11px ui-monospace, monospace"; ctx.fillStyle = "rgba(56,189,248,0.75)";
        ctx.fillText(`${altFt.toLocaleString()} ft`, ax, ay + 37);
      } else {
        ctx.beginPath(); ctx.arc(ax, ay, 9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(167,139,250,0.15)"; ctx.fill();
        ctx.beginPath(); ctx.arc(ax, ay, 9, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(167,139,250,0.75)"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = "12px serif"; ctx.fillStyle = "rgba(167,139,250,0.9)";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("✈", ax, ay); ctx.textBaseline = "alphabetic";
        ctx.font = "10px ui-monospace, monospace"; ctx.fillStyle = "rgba(167,139,250,0.8)";
        ctx.fillText(label, ax, ay + 17);
      }
    };
    for (const c of candidates) if (!activeIds.has(c.flight.id)) drawFlight(c.flight, false);
    for (const c of activeTransits) drawFlight(c.flight, true);

    if (moonAlt < 0) {
      ctx.font = "14px ui-monospace, monospace";
      ctx.fillStyle = "rgba(251,191,36,0.7)"; ctx.textAlign = "center";
      ctx.fillText("Moon below horizon", W / 2, H - 20);
    }
  }, [pov, pathSamples, moonAz, moonAlt, nowMs, status, candidates, activeTransits, observer]);

  useEffect(() => {
    const id = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(id);
  }, [drawCanvas]);

  return (
    <div className="relative h-full w-full">
      {/* Panorama */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Canvas overlay */}
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 9999 }}
      />

      {/* Loading */}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-[10000]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-400" />
            <span className="text-sm text-zinc-300">Loading Street View…</span>
          </div>
        </div>
      )}

      {/* Unavailable */}
      {status === "unavailable" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/90 z-[10000]">
          <div className="text-center">
            <div className="mb-2 text-4xl">📍</div>
            <p className="text-base font-semibold text-zinc-200">Street View unavailable</p>
            <p className="mt-1 text-sm text-zinc-500">No panorama within 100 m of observer location</p>
          </div>
        </div>
      )}

    </div>
  );
}
