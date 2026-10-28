"use client";

import { useMemo } from "react";
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
 * vrijeme kao i stari klizač (isti `<input type="range">` ispod).
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

export function MoonTimeLine({
  anchorMs,
  widthHours,
  offsetHours,
  onSlider,
  showEphemeris,
  isMoonBelowHorizon,
  observer,
}: {
  anchorMs: number;
  widthHours: number;
  offsetHours: number;
  onSlider: (e: React.ChangeEvent<HTMLInputElement>) => void;
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

  return (
    <div
      className={`relative h-full min-w-0 flex-1 px-[22px] ${
        isMoonBelowHorizon && showEphemeris ? "opacity-70" : ""
      }`}
    >
      <div
        className="relative h-full has-[:focus-visible]:rounded-[var(--r-ctl)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[color:var(--ink)]"
        aria-hidden={!profile}
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
            {profile.stations.map((st) => (
              <span key={`${st.frac}-${st.label}`}>
                <i
                  aria-hidden
                  className="absolute top-[24px] -ml-[7.5px] size-[15px] rounded-full border-[3.5px] border-[color:var(--ink)] bg-[color:var(--ground)]"
                  style={{ left: pos(st.frac) }}
                />
                <span
                  className="absolute top-[46px] -translate-x-1/2 whitespace-nowrap text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]"
                  style={{ left: pos(st.frac) }}
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
              {offsetHours < 0.05 ? "Now" : `+${formatFixed(offsetHours, 1)} h`}
            </span>
          </>
        ) : null}
        <input
          type="range"
          min={0}
          max={max}
          step={STEP_HOURS}
          value={Math.min(offsetHours, max)}
          onChange={onSlider}
          disabled={!showEphemeris}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          aria-label="Simulated time offset in hours"
        />
      </div>
    </div>
  );
}
