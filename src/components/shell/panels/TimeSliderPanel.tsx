"use client";

import { useId } from "react";

import { SectionCardSurface } from "@/components/shell/ShellSectionCard";
import { SectionIconTime } from "@/components/shell/sectionCategoryIcons";
import { useHasMounted } from "@/hooks/useHasMounted";

type TimeSliderPanelProps = {
  referenceEpochMs: number;
  offsetHours: number;
  onOffsetHoursChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showEphemeris: boolean;
  /** Simulated moon below geometric horizon; dims chip and short hint. */
  isMoonBelowHorizon?: boolean;
  /** 0 = window start, max = end (all hours from the left of the time window). */
  sliderMaxHours: number;
  /** en-GB HH:MM at window start and end. */
  timeSliderStartLabel: string;
  timeSliderEndLabel: string;
  /** "moonriseToSet" | circumpolar vs ±6h fallback. */
  timeSliderMode: "moonriseToSet" | "fallback";
  /**
   * `mapChip` — kompaktno uz weather (isti omot kao `ShellSectionCard`, accent amber).
   * `panel` — veća kartica (npr. sidebar).
   */
  variant?: "panel" | "mapChip";
  /** Dodatni razredi na korijen. */
  className?: string;
};

export function TimeSliderPanel({
  referenceEpochMs,
  offsetHours,
  onOffsetHoursChange,
  showEphemeris,
  isMoonBelowHorizon = false,
  sliderMaxHours,
  timeSliderStartLabel,
  timeSliderEndLabel,
  timeSliderMode,
  variant = "panel",
  className = "",
}: TimeSliderPanelProps) {
  const hasMounted = useHasMounted();
  const headingId = useId();
  const isChip = variant === "mapChip";
  const heading =
    timeSliderMode === "moonriseToSet"
      ? "Time (moonrise → set)"
      : "Time (±6 h fallback)";
  const rangeTitle =
    timeSliderMode === "moonriseToSet"
      ? "Simulated time from moonrise to moonset (UTC day)"
      : "Simulated time · 12h window (±6h) until rise/set load";
  const horizonClass =
    isMoonBelowHorizon && showEphemeris
      ? " opacity-60 saturate-[0.65]"
      : "";
  const panelRoot = `min-h-0 w-full min-w-0${horizonClass}${
    className ? ` ${className}` : ""
  }`;

  const startLabel = hasMounted ? timeSliderStartLabel : "—";
  const endLabel = hasMounted ? timeSliderEndLabel : "—";

  const dateTimeStr =
    hasMounted && showEphemeris
      ? new Date(referenceEpochMs).toLocaleString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : "—";

  if (isChip) {
    return (
      <SectionCardSurface
        accent="amber"
        className={`relative flex min-h-0 min-w-0 flex-col p-2.5 backdrop-blur-md${panelRoot}`}
        title={rangeTitle}
        aria-labelledby={headingId}
      >
        <div className="flex min-w-0 items-center gap-1.5 border-b border-white/[0.07] pb-2">
          <span className="text-amber-400/80" aria-hidden>
            <SectionIconTime />
          </span>
          <h2 id={headingId} className="mt-section-label min-w-0 border-0 pb-0">
            {heading}
          </h2>
        </div>
        <div className="mt-1 flex min-h-0 flex-1 flex-col justify-center">
          <div className="flex min-w-0 items-center gap-2">
            <p
              className="shrink-0 font-mono text-[0.65rem] tabular-nums leading-none text-zinc-300"
              suppressHydrationWarning
            >
              {dateTimeStr}
            </p>
            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={0}
                max={Math.max(0, sliderMaxHours)}
                step={0.1}
                value={Math.min(offsetHours, Math.max(0, sliderMaxHours))}
                onChange={onOffsetHoursChange}
                disabled={!showEphemeris}
                className="h-1 w-full min-w-[3.25rem] cursor-pointer accent-amber-500/80 disabled:opacity-40"
                aria-label="Time within visibility window, hours from start"
              />
              <div className="mt-0 flex justify-between gap-1 px-px text-[0.48rem] leading-none text-zinc-600">
                <span
                  className="max-w-[3rem] shrink-0 truncate"
                  title="Window start"
                  suppressHydrationWarning
                >
                  {startLabel}
                </span>
                <span className="text-zinc-500" aria-hidden>
                  ·
                </span>
                <span
                  className="max-w-[3rem] shrink-0 truncate text-right"
                  title="Window end"
                  suppressHydrationWarning
                >
                  {endLabel}
                </span>
              </div>
            </div>
            <p
              className="shrink-0 font-mono text-[0.6rem] tabular-nums text-amber-400/75"
              aria-label={`${offsetHours >= 0 ? "" : ""}${offsetHours.toFixed(1)} hours from window start`}
            >
              {offsetHours.toFixed(1)}h
            </p>
          </div>
        </div>
        {isMoonBelowHorizon && showEphemeris ? (
          <p className="mt-0.5 shrink-0 text-[0.48rem] text-zinc-500/90">
            Moon below horizon
          </p>
        ) : null}
      </SectionCardSurface>
    );
  }

  return (
    <SectionCardSurface
      accent="amber"
      className={panelRoot}
      title={rangeTitle}
      aria-labelledby={headingId}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-white/[0.07] pb-2.5">
        <span className="text-amber-400/80" aria-hidden>
          <SectionIconTime />
        </span>
        <h2 id={headingId} className="mt-section-label min-w-0 border-0 pb-0">
          {heading}
        </h2>
      </div>
      <p
        className="mt-1.5 text-center font-mono text-sm tabular-nums text-zinc-200"
        suppressHydrationWarning
      >
        {dateTimeStr}
      </p>
      <div className="mt-2 flex items-center justify-between gap-1 text-xs text-zinc-500">
        <span
          className="max-w-[4rem] shrink truncate"
          title="Window start"
          suppressHydrationWarning
        >
          {startLabel}
        </span>
        <span>→</span>
        <span
          className="max-w-[4rem] shrink truncate text-right"
          title="Window end"
          suppressHydrationWarning
        >
          {endLabel}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, sliderMaxHours)}
        step={0.1}
        value={Math.min(offsetHours, Math.max(0, sliderMaxHours))}
        onChange={onOffsetHoursChange}
        disabled={!showEphemeris}
        className="mt-1 w-full accent-amber-400 disabled:opacity-40"
        aria-label="Time within visibility window, hours from start"
      />
      <p className="mt-1.5 text-center text-xs text-zinc-500">
        From start:{" "}
        <span className="font-mono text-amber-200/90">
          {offsetHours.toFixed(1)} h
        </span>
      </p>
      {isMoonBelowHorizon && showEphemeris ? (
        <p className="mt-1.5 text-center text-[0.7rem] text-zinc-500/90">
          Moon below horizon
        </p>
      ) : null}
    </SectionCardSurface>
  );
}
