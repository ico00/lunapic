"use client";

import { useId } from "react";

import { SectionCardSurface } from "@/components/shell/ShellSectionCard";
import { SectionIconTime } from "@/components/shell/sectionCategoryIcons";
import { useHasMounted } from "@/hooks/useHasMounted";

const SLIDER_STEP_HOURS = 1 / 60; // 1 minute

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
  /** Forward from last sync (~24 h). */
  timeSliderMode: "forward24h";
  /**
   * `mapChip` — kompaktno uz weather (isti omot kao `ShellSectionCard`, accent amber).
   * `panel` — veća kartica (npr. sidebar).
   */
  variant?: "panel" | "mapChip";
  /** Sakrij heading row (ikona + naslov) — za kompaktnu mobilnu traku. */
  hideHeading?: boolean;
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
  hideHeading = false,
  className = "",
}: TimeSliderPanelProps) {
  const hasMounted = useHasMounted();
  const headingId = useId();
  const isChip = variant === "mapChip";
  const heading =
    timeSliderMode === "forward24h" ? "Time (next 24 h)" : "Time";
  const rangeTitle =
    timeSliderMode === "forward24h"
      ? "Simulated time from Sync — about 24 h forward (civil day)"
      : "Simulated time";
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
    // Mobilni slim ribbon — pravi tanji line: bez bordera, bez accent linije,
    // bez start/end labela ispod slidera. Roditelj daje glass chrome.
    if (hideHeading) {
      // Skrati datetime na samo HH:MM:SS (drugi dio nakon zareza).
      const timeOnly =
        dateTimeStr.includes(",")
          ? dateTimeStr.split(",")[1]?.trim().slice(0, 5) ?? "—"
          : "—";
      return (
        <div
          className={`flex w-full min-w-0 items-center gap-2.5${horizonClass}${className ? ` ${className}` : ""}`}
        >
          <p
            className="shrink-0 font-mono text-[length:var(--fs-label)] font-semibold tabular-nums leading-none text-[color:var(--t-primary)]"
            suppressHydrationWarning
            title={dateTimeStr}
          >
            {timeOnly}
          </p>
          <input
            type="range"
            min={0}
            max={Math.max(0, sliderMaxHours)}
            step={SLIDER_STEP_HOURS}
            value={Math.min(offsetHours, Math.max(0, sliderMaxHours))}
            onChange={onOffsetHoursChange}
            disabled={!showEphemeris}
            className="h-1 w-full min-w-[3.25rem] cursor-pointer accent-amber-400 disabled:opacity-40"
            aria-label="Simulated time offset in hours"
          />
          <p
            className="shrink-0 font-mono text-[length:var(--fs-label)] font-semibold tabular-nums text-amber-300"
            aria-label={`${offsetHours.toFixed(1)} hours forward from last Sync`}
          >
            {offsetHours >= 0 ? "+" : ""}
            {offsetHours.toFixed(1)}h
          </p>
        </div>
      );
    }

    return (
      <SectionCardSurface
        accent="amber"
        className={`relative flex min-h-0 min-w-0 flex-col ${
          hideHeading ? "p-2" : "p-2.5"
        } backdrop-blur-md${panelRoot}`}
        title={rangeTitle}
        aria-labelledby={headingId}
      >
        {!hideHeading && (
          <div className="flex min-w-0 items-center gap-1.5 border-b border-white/[0.07] pb-2">
            <span className="text-yellow-400/85" aria-hidden>
              <SectionIconTime />
            </span>
            <h2 id={headingId} className="mt-section-label min-w-0 border-0 pb-0">
              {heading}
            </h2>
          </div>
        )}
        <div className={`flex min-h-0 flex-1 flex-col justify-center ${
          hideHeading ? "" : "mt-1"
        }`}>
          <div className="flex min-w-0 items-center gap-2">
            <p
              className="shrink-0 font-mono text-[length:var(--fs-meta)] tabular-nums leading-none text-[color:var(--t-secondary)]"
              suppressHydrationWarning
            >
              {dateTimeStr}
            </p>
            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={0}
                max={Math.max(0, sliderMaxHours)}
                step={SLIDER_STEP_HOURS}
                value={Math.min(offsetHours, Math.max(0, sliderMaxHours))}
                onChange={onOffsetHoursChange}
                disabled={!showEphemeris}
                className="h-1.5 w-full min-w-[3.25rem] cursor-pointer accent-amber-500 disabled:opacity-40"
                aria-label="Simulated time, hours forward from last Sync"
              />
              <div className="mt-0 flex justify-between gap-1 px-px text-[length:var(--fs-label)] leading-none text-[color:var(--t-tertiary)]">
                <span
                  className="max-w-[3rem] shrink-0 truncate"
                  title="Time at last Sync"
                  suppressHydrationWarning
                >
                  {startLabel}
                </span>
                <span className="text-[color:var(--t-tertiary)]" aria-hidden>
                  ·
                </span>
                <span
                  className="max-w-[3rem] shrink-0 truncate text-right"
                  title="About 24 h after Sync"
                  suppressHydrationWarning
                >
                  {endLabel}
                </span>
              </div>
            </div>
            <p
              className="shrink-0 font-mono text-[length:var(--fs-label)] tabular-nums text-amber-400/85"
              aria-label={`${offsetHours.toFixed(1)} hours forward from last Sync`}
            >
              {offsetHours.toFixed(1)}h
            </p>
          </div>
        </div>
        {/* Uvijek prisutan wrapper — sprječava skok visine kad se pojavi/nestane */}
        <p
          className={`mt-0.5 shrink-0 text-[length:var(--fs-meta)] font-medium text-amber-400/70 transition-opacity duration-200 ${
            isMoonBelowHorizon && showEphemeris ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          aria-hidden={!(isMoonBelowHorizon && showEphemeris)}
        >
          ☽ Moon below horizon
        </p>
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
        <span className="text-yellow-400/85" aria-hidden>
          <SectionIconTime />
        </span>
        <h2 id={headingId} className="mt-section-label min-w-0 border-0 pb-0">
          {heading}
        </h2>
      </div>
      <p
        className="mt-1.5 text-center font-mono text-[length:var(--fs-body)] tabular-nums text-[color:var(--t-primary)]"
        suppressHydrationWarning
      >
        {dateTimeStr}
      </p>
      <div className="mt-2 flex items-center justify-between gap-1 text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
        <span
          className="max-w-[4rem] shrink truncate"
          title="Time at last Sync"
          suppressHydrationWarning
        >
          {startLabel}
        </span>
        <span>→</span>
        <span
          className="max-w-[4rem] shrink truncate text-right"
          title="About 24 h after Sync"
          suppressHydrationWarning
        >
          {endLabel}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, sliderMaxHours)}
        step={SLIDER_STEP_HOURS}
        value={Math.min(offsetHours, Math.max(0, sliderMaxHours))}
        onChange={onOffsetHoursChange}
        disabled={!showEphemeris}
        className="mt-1 w-full accent-amber-500 disabled:opacity-40"
        aria-label="Simulated time, hours forward from last Sync"
      />
      <p className="mt-1.5 text-center text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
        From Sync:{" "}
        <span className="font-mono text-amber-300/90">
        {offsetHours.toFixed(1)} h
        </span>
      </p>
      {/* Uvijek prisutan wrapper — sprječava skok visine kad se pojavi/nestane */}
      <p
        className={`mt-1.5 text-center text-[length:var(--fs-label)] font-medium text-amber-400/70 transition-opacity duration-200 ${
          isMoonBelowHorizon && showEphemeris ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!(isMoonBelowHorizon && showEphemeris)}
      >
        ☽ Moon below horizon
      </p>
    </SectionCardSurface>
  );
}
