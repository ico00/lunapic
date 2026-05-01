"use client";

import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconCompass } from "@/components/shell/sectionCategoryIcons";
import { useDeviceCompass } from "@/hooks/useDeviceCompass";
import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import { useCallback, useState } from "react";

/** Moon–heading delta needle plus a compass rose rotated so N/E/S/W track the horizon. */
const ROSE_TICK_DEG = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as const;
const CARDINALS = [
  { label: "N", deg: 0 },
  { label: "E", deg: 90 },
  { label: "S", deg: 180 },
  { label: "W", deg: 270 },
] as const;

const INTERCARDINALS = [
  { label: "NE", deg: 45 },
  { label: "SE", deg: 135 },
  { label: "SW", deg: 225 },
  { label: "NW", deg: 315 },
] as const;

export function CompassAimPanel() {
  const moon = useMoonStateComputed();
  const { headingDeg, hasHeading, needPermission, request, listening } =
    useDeviceCompass();
  const [err, setErr] = useState<string | null>(null);

  const onEnable = useCallback(async () => {
    setErr(null);
    const r = await request();
    if (r != null) {
      setErr(r);
    }
  }, [request]);

  const delta =
    hasHeading && headingDeg != null
      ? ((moon.azimuthDeg - headingDeg + 540) % 360) - 180
      : 0;

  const headingForRose = hasHeading && headingDeg != null ? headingDeg : 0;

  return (
    <ShellSectionCard
      className="mt-3"
      title="Compass → Moon"
      accent="lime"
      icon={<SectionIconCompass />}
    >
      {!listening && needPermission && (
        <button
          type="button"
          onClick={onEnable}
          className="mt-0 w-full rounded-md border border-blue-500/40 bg-blue-500/10 py-1.5 text-sm text-yellow-400/90"
        >
          Allow orientation (iOS)
        </button>
      )}
      {err && <p className="mt-2 text-[0.65rem] text-red-400/90">{err}</p>}
      {listening && (
        <div className="mt-3 flex w-full min-w-0 flex-col items-center gap-2">
          <div
            className="relative h-[7.5rem] w-[7.5rem] shrink-0 overflow-visible rounded-full border-2 border-zinc-600 bg-zinc-950/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
            aria-label="Compass rose and moon azimuth error: align gold needle to the top marker"
          >
            {/* Rotating rose: geographic frame; turns so cardinals track the horizon */}
            <div
              className="absolute inset-[5px] rounded-full"
              style={{
                transform: `rotate(${-headingForRose}deg)`,
                transformOrigin: "50% 50%",
                transition: "transform 100ms linear",
              }}
            >
              {ROSE_TICK_DEG.map((deg) => {
                const isCardinal = deg % 90 === 0;
                return (
                  <div
                    key={deg}
                    className={`absolute left-1/2 top-1/2 ${
                      isCardinal ? "w-[2px] bg-zinc-500/90" : "w-px bg-zinc-600/70"
                    }`}
                    style={{
                      height: isCardinal ? "46%" : "36%",
                      transformOrigin: "50% 100%",
                      transform: `translate(-50%, -100%) rotate(${deg}deg)`,
                    }}
                  />
                );
              })}
              {CARDINALS.map(({ label, deg }) => (
                <span
                  key={label}
                  className={`absolute left-1/2 top-1/2 select-none text-[0.55rem] font-semibold leading-none ${
                    label === "N"
                      ? "text-yellow-400/95"
                      : "text-zinc-400/95"
                  }`}
                  style={{
                    transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-2.35rem) rotate(${headingForRose}deg)`,
                  }}
                >
                  {label}
                </span>
              ))}
              {INTERCARDINALS.map(({ label, deg }) => (
                <span
                  key={label}
                  className="absolute left-1/2 top-1/2 select-none text-[0.45rem] font-medium leading-none text-zinc-500/85"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-2.1rem) rotate(${headingForRose}deg)`,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
            {/* Fixed to screen: top of phone / forward in the horizontal plane */}
            <span
              className="pointer-events-none absolute left-1/2 top-1 z-[12] -translate-x-1/2 text-[0.55rem] leading-none text-blue-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
              title="Top of phone — align the gold needle here when aimed at the moon"
            >
              ▲
            </span>
            <div
              className="absolute left-1/2 top-1/2 z-[11] w-0.5 rounded-full bg-yellow-400 shadow shadow-blue-500/20"
              style={{
                height: 40,
                transform: `translate(-50%, -100%) rotate(${delta}deg)`,
                transformOrigin: "50% 100%",
              }}
            />
            <div className="absolute left-1/2 top-1/2 z-[11] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 ring-1 ring-zinc-950" />
          </div>
          <p className="w-full min-w-0 break-words px-1 text-center text-[0.7rem] leading-snug text-zinc-400">
            {hasHeading
              ? `Turn ≈ ${Math.abs(delta).toFixed(0)}° ${
                  delta > 0 ? "↻" : "↺"
                }`
              : "Waiting for sensor… (hold the phone in landscape if supported)"}
          </p>
        </div>
      )}
    </ShellSectionCard>
  );
}
