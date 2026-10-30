"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useHasMounted } from "@/hooks/useHasMounted";
import { getMoonPosition } from "@/lib/domain/astro/moon";
import {
  CAUTION_BELOW_DEG,
  CRITICAL_BELOW_DEG,
} from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { formatFixed } from "@/lib/format/numbers";
import type { GroundObserver } from "@/types/geo";

/**
 * Vremenska traka kao linija sa stanicama (spec §2b.4): puna = Mjesec iznad
 * 12°, isprekidana = 5–12°, prigušena = ispod 5° (nema kandidata). Stanice su
 * vrhunac Mjeseca i prijelazi preko 5°. Povlačenje po liniji pomiče simulirano
 * vrijeme; cijela traka prima dodir, jer se na iOS-u prozirni `<input type="range">`
 * pomiče samo s palca, a palac se ne vidi. Input ostaje za tipkovnicu.
 */

const STEP_MIN = 15;
const STEP_HOURS = 1 / 60;

type Tier = "optimal" | "caution" | "critical";

function tierOf(altDeg: number): Tier {
  if (altDeg < CRITICAL_BELOW_DEG) return "critical";
  if (altDeg < CAUTION_BELOW_DEG) return "caution";
  return "optimal";
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type Run = { from: number; to: number; tier: Tier };
type Station = { frac: number; label: string; detail?: string };

/** Procjena širine oznake (12px, semibold) — dovoljno za izbjegavanje preklapanja. */
const CHAR_PX = 7;
const LABEL_GAP_PX = 8;
/** Oznaka smije izaći iz trake do ruba okvira (`px-[22px]`), ali ne preko njega. */
const LABEL_EDGE_PX = 18;

function labelWidthPx(text: string): number {
  return text.length * CHAR_PX;
}

/**
 * Oznake stanica idu ispod linije; ona koja bi se preklopila s oznakom "Now"
 * ili s prethodnom oznakom ispod linije prelazi iznad linije.
 */
export function placeStationLabels(
  stations: readonly Station[],
  trackPx: number,
  nowBox: readonly [number, number],
): ("below" | "above")[] {
  const hits = (a: readonly [number, number], b: readonly [number, number]) =>
    a[0] < b[1] + LABEL_GAP_PX && b[0] < a[1] + LABEL_GAP_PX;
  const order = stations.map((_, i) => i).sort((a, b) => stations[a].frac - stations[b].frac);
  const rows: ("below" | "above")[] = stations.map(() => "below");
  let lastBelow: readonly [number, number] | null = null;
  let lastAbove: readonly [number, number] | null = null;
  for (const i of order) {
    const st = stations[i];
    const x = trackPx * (0.01 + st.frac * 0.98);
    const w = labelWidthPx(st.label + (st.detail ?? ""));
    const box = [x - w / 2, x + w / 2] as const;
    const blocked = hits(box, nowBox) || (lastBelow != null && hits(box, lastBelow));
    if (blocked && !(lastAbove != null && hits(box, lastAbove))) {
      rows[i] = "above";
      lastAbove = box;
    } else {
      lastBelow = box;
    }
  }
  return rows;
}

/** Pomak oznake kad bi centrirana izašla iz okvira trake (na telefonu je traka uska). */
export function stationLabelShiftPx(x: number, textPx: number, trackPx: number): number {
  const half = textPx / 2;
  const overLeft = -LABEL_EDGE_PX - (x - half);
  const overRight = x + half - (trackPx + LABEL_EDGE_PX);
  return overLeft > 0 ? overLeft : overRight > 0 ? -overRight : 0;
}

export function MoonTimeLine({
  anchorMs,
  widthHours,
  offsetHours,
  onOffsetHours,
  showEphemeris,
  isMoonBelowHorizon,
  observer,
}: {
  anchorMs: number;
  widthHours: number;
  offsetHours: number;
  onOffsetHours: (hours: number) => void;
  showEphemeris: boolean;
  isMoonBelowHorizon: boolean;
  observer: GroundObserver;
}) {
  const mounted = useHasMounted();
  const max = Math.max(0, widthHours);

  const profile = useMemo(() => {
    if (!mounted || max <= 0) return null;
    const n = Math.round((max * 60) / STEP_MIN);
    const alts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const at = new Date(anchorMs + i * STEP_MIN * 60_000);
      alts.push(getMoonPosition(at, observer.lat, observer.lng).altitudeDeg);
    }
    const runs: Run[] = [];
    for (let i = 0; i < n; i++) {
      const tier = tierOf((alts[i] + alts[i + 1]) / 2);
      const last = runs[runs.length - 1];
      if (last && last.tier === tier) last.to = (i + 1) / n;
      else runs.push({ from: i / n, to: (i + 1) / n, tier });
    }
    const stations: Station[] = [];
    let peak = 0;
    for (let i = 1; i <= n; i++) if (alts[i] > alts[peak]) peak = i;
    if (peak > 0 && peak < n && alts[peak] >= CRITICAL_BELOW_DEG) {
      stations.push({
        frac: peak / n,
        label: `Peak ${hhmm(anchorMs + peak * STEP_MIN * 60_000)}`,
        detail: ` · ${formatFixed(alts[peak], 0)}°`,
      });
    }
    for (let i = 1; i <= n; i++) {
      const was = alts[i - 1] >= CRITICAL_BELOW_DEG;
      const is = alts[i] >= CRITICAL_BELOW_DEG;
      if (was === is) continue;
      stations.push({
        frac: i / n,
        label: `${is ? "Above" : "Below"} ${CRITICAL_BELOW_DEG}° ${hhmm(anchorMs + i * STEP_MIN * 60_000)}`,
      });
    }
    return { runs, stations };
  }, [mounted, anchorMs, max, observer.lat, observer.lng]);

  const frac = max > 0 ? Math.min(1, Math.max(0, offsetHours / max)) : 0;
  const pos = (f: number) => `${1 + f * 98}%`;
  const width = (a: number, b: number) => `${(b - a) * 98}%`;

  const trackRef = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setTrackPx(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || !showEphemeris || max <= 0) return;
    const rect = el.getBoundingClientRect();
    const f = ((e.clientX - rect.left) / rect.width - 0.01) / 0.98;
    onOffsetHours(Math.round(Math.min(1, Math.max(0, f)) * max * 60) * STEP_HOURS);
  };

  const nowLabel = offsetHours < 0.05 ? "Now" : `+${formatFixed(offsetHours, 1)} h`;
  const nowX = trackPx * (0.01 + frac * 0.98);
  const nowW = labelWidthPx(nowLabel);
  const nowBox = (frac > 0.9 ? [nowX - nowW, nowX] : [nowX - 7, nowX - 7 + nowW]) as [number, number];
  const rows = profile && trackPx > 0 ? placeStationLabels(profile.stations, trackPx, nowBox) : null;

  return (
    <div
      className={`relative h-full min-w-0 flex-1 px-[22px] ${
        isMoonBelowHorizon && showEphemeris ? "opacity-70" : ""
      }`}
    >
      <div
        ref={trackRef}
        data-testid="moon-time-line"
        className="relative h-full cursor-pointer touch-none select-none has-[:focus-visible]:rounded-[var(--r-ctl)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[color:var(--ink)]"
        aria-hidden={!profile}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e);
        }}
      >
        {profile ? (
          <>
            {profile.runs.map((r) => (
              <i
                key={`${r.from}-${r.tier}`}
                aria-hidden
                className="absolute top-[28px] h-[7px]"
                style={{
                  left: pos(r.from),
                  width: width(r.from, r.to),
                  borderRadius: r.from === 0 ? "4px 0 0 4px" : r.to === 1 ? "0 4px 4px 0" : 0,
                  background:
                    r.tier === "optimal"
                      ? "var(--moon)"
                      : r.tier === "caution"
                        ? "repeating-linear-gradient(90deg, var(--moon) 0 3px, transparent 3px 8px)"
                        : "#33466f",
                }}
              />
            ))}
            {profile.stations.map((st, i) => (
              <span key={`${st.frac}-${st.label}`}>
                <i
                  aria-hidden
                  className="absolute top-[24px] -ml-[7.5px] size-[15px] rounded-full border-[3.5px] border-[color:var(--ink)] bg-[color:var(--ground)]"
                  style={{ left: pos(st.frac) }}
                />
                <span
                  className={`absolute ${rows?.[i] === "above" ? "top-[4px]" : "top-[46px]"} whitespace-nowrap text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]`}
                  style={{
                    left: pos(st.frac),
                    transform: `translateX(calc(-50% + ${stationLabelShiftPx(
                      trackPx * (0.01 + st.frac * 0.98),
                      labelWidthPx(st.label + (st.detail ?? "")),
                      trackPx
                    )}px))`,
                  }}
                >
                  {st.label}
                  {st.detail ? <span className="max-[1280px]:hidden">{st.detail}</span> : null}
                </span>
              </span>
            ))}
            <i
              aria-hidden
              className="absolute top-[21px] -ml-[9px] size-[21px] rounded-full border-4 border-[color:var(--ink)] bg-[color:var(--ink)]"
              style={{ left: pos(frac) }}
            />
            <span
              className="absolute top-[46px] text-[length:var(--fs-label)] font-bold text-[color:var(--ink-2)]"
              style={{ left: pos(frac), transform: frac > 0.9 ? "translateX(-100%)" : "translateX(-7px)" }}
            >
              {nowLabel}
            </span>
          </>
        ) : null}
        <input
          type="range"
          min={0}
          max={max}
          step={STEP_HOURS}
          value={Math.min(offsetHours, max)}
          onChange={(e) => onOffsetHours(parseFloat(e.target.value))}
          disabled={!showEphemeris}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          aria-label="Simulated time offset in hours"
        />
      </div>
    </div>
  );
}
