"use client";

import {
  ALTITUDE_BANDS,
  flightAltitudeLegendGradientCss,
  type FlightAltitudeLegendUnit,
} from "@/lib/map/flightAltitudeColor";
import { useEffect, useRef, useState } from "react";
import { useMoonTransitStore } from "@/stores/moon-transit-store";

const legendCheckboxClass =
  "mt-0.5 h-4 w-4 shrink-0 rounded border border-white/15 bg-[color:var(--glass-1)] accent-[color:var(--mint)] text-[color:var(--mint)] outline-none focus:ring-2 focus:ring-sky-500/35 focus:ring-offset-0 sm:mt-0";

const SLIDER_MAX = ALTITUDE_BANDS.length; // 0=All, 1–6=band

const METERS_TO_FEET = 3.280839895013123;

function bandTickLabel(index: number, unit: FlightAltitudeLegendUnit): string {
  if (index === 0) return "All";
  const band = ALTITUDE_BANDS[index - 1];
  if (!band) return "";
  if (band.minMeters === 0) return "0";
  if (unit === "ft") return Math.round((band.minMeters * METERS_TO_FEET) / 1000) + "k";
  const km = Math.round((band.minMeters / 1000) * 10) / 10;
  return km + "k";
}

/**
 * Legenda boje zrakoplova po visini (MSL / GeoJSON `altitudeMeters`).
 * Engleski tekst (UI konvencija proizvoda).
 */
export function FlightAltitudeLegend() {
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const mapAircraftAltitudeColors = useMoonTransitStore(
    (s) => s.mapAircraftAltitudeColors
  );
  const setMapAircraftAltitudeColors = useMoonTransitStore(
    (s) => s.setMapAircraftAltitudeColors
  );
  const flightAltitudeLegendUnit = useMoonTransitStore(
    (s) => s.flightAltitudeLegendUnit
  );
  const setFlightAltitudeLegendUnit = useMoonTransitStore(
    (s) => s.setFlightAltitudeLegendUnit
  );
  const altitudeBandIndex = useMoonTransitStore((s) => s.altitudeBandIndex);
  const setAltitudeBandIndex = useMoonTransitStore(
    (s) => s.setAltitudeBandIndex
  );

  const activeBand = altitudeBandIndex > 0 ? ALTITUDE_BANDS[altitudeBandIndex - 1] : null;

  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (altitudeBandIndex > 0) {
      setTooltipVisible(true);
      hideTimer.current = setTimeout(() => setTooltipVisible(false), 1800);
    } else {
      setTooltipVisible(false);
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [altitudeBandIndex]);

  // Thumb position as % of slider width (accounts for native thumb inset ~10px each side)
  const thumbPct = (altitudeBandIndex / SLIDER_MAX) * 100;

  return (
    <div
      data-testid="flight-altitude-legend"
      className={`pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1.5 mt-glass-elevated rounded-[var(--r-xl)] px-3 py-2 text-[length:var(--fs-meta)] leading-normal text-[color:var(--t-secondary)] max-md:min-h-0 max-md:gap-1 max-md:py-1.5 max-md:pr-2.5 md:w-80 md:gap-1.5 md:py-2 md:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] md:absolute md:bottom-[4.5rem] md:left-[6rem] md:right-auto md:z-10 ${selectedFlightId != null ? "max-md:hidden" : ""}`}
    >
      {/* Row: checkbox + unit toggle */}
      <div className="pointer-events-auto flex min-w-0 items-start gap-2 sm:items-center">
        <label className="flex min-w-0 flex-1 cursor-pointer touch-manipulation items-start gap-2 select-none sm:items-center">
          <input
            type="checkbox"
            className={legendCheckboxClass}
            checked={mapAircraftAltitudeColors}
            onChange={(e) => setMapAircraftAltitudeColors(e.target.checked)}
            data-testid="flight-altitude-colors-toggle"
            aria-label="Color aircraft markers by altitude (MSL). When off, a single neutral tone is used except shot-feasible flights stay green."
          />
          <span className="min-w-0 text-[length:var(--fs-body)] leading-snug text-[color:var(--t-primary)]">
            Altitude (MSL)
          </span>
        </label>
        <div
          className="shrink-0 pt-0.5 sm:pt-0"
          role="group"
          aria-label="Altitude legend tick unit"
        >
          <div className="inline-flex rounded-[var(--r-sm)] border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)] p-0.5 shadow-[var(--shadow-1)]">
            {(["ft", "km"] as const).map((u) => {
              const active = flightAltitudeLegendUnit === u;
              return (
                <button
                  key={u}
                  type="button"
                  className={
                    active
                      ? "min-w-[2.25rem] rounded-md border border-sky-400/30 bg-sky-500/15 px-2 py-0.5 text-[length:var(--fs-label)] font-semibold uppercase tracking-wide text-sky-200 shadow-[0_0_0_1px_rgba(56,189,248,0.12)]"
                      : "min-w-[2.25rem] rounded-md px-2 py-0.5 text-[length:var(--fs-label)] font-semibold uppercase tracking-wide text-[color:var(--t-tertiary)] transition hover:bg-white/[0.05] hover:text-[color:var(--t-secondary)]"
                  }
                  aria-pressed={active}
                  onClick={() => setFlightAltitudeLegendUnit(u)}
                  data-testid={`flight-altitude-legend-unit-${u}`}
                  data-value={u}
                >
                  {u}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Band tooltip — floats above the legend card, auto-hides */}
      {activeBand && (
        <div
          aria-live="polite"
          aria-atomic
          className={`pointer-events-none absolute bottom-full z-20 mb-2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-md)] border border-[color:var(--glass-stroke)] bg-[color:var(--glass-2)] px-2.5 py-1 text-[length:var(--fs-label)] shadow-[var(--shadow-2)] backdrop-blur-md transition-all duration-200 ${tooltipVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
          style={{ left: `clamp(4rem, ${thumbPct}%, calc(100% - 4rem))` }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: activeBand.color }}
            aria-hidden
          />
          <span className="font-medium text-[color:var(--t-primary)]">{activeBand.category}</span>
          <span className="text-[color:var(--t-tertiary)]">·</span>
          <span className="text-[color:var(--t-secondary)]">{activeBand.ftLabel}</span>
        </div>
      )}

      {/* Gradient bar + overlaid slider */}
      <div
        className={`pointer-events-auto relative h-6 w-full transition-opacity ${mapAircraftAltitudeColors ? "opacity-100" : "opacity-40"}`}
      >
        {/* Gradient background */}
        <div
          className="absolute inset-0 rounded-md ring-1 ring-inset ring-white/[0.08]"
          style={{ background: flightAltitudeLegendGradientCss() }}
          aria-hidden
        />
        {/* Active band inset border */}
        {activeBand && (
          <div
            className="pointer-events-none absolute inset-0 rounded-md"
            style={{ boxShadow: `inset 0 0 0 2px ${activeBand.color}` }}
            aria-hidden
          />
        )}
        {/* Slider — transparent track, circle thumb matching timeline style */}
        <input
          type="range"
          min={0}
          max={SLIDER_MAX}
          step={1}
          value={altitudeBandIndex}
          onChange={(e) => setAltitudeBandIndex(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing appearance-none bg-transparent
            [&::-webkit-slider-runnable-track]:bg-transparent
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.45),0_0_0_1px_rgba(0,0,0,0.12)]
            [&::-moz-range-track]:bg-transparent
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-none
            [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.45),0_0_0_1px_rgba(0,0,0,0.12)]"
          aria-label="Filter flights by altitude band. 0 = All, 1–6 = specific band."
          data-testid="altitude-band-slider"
        />
      </div>

      {/* Tick labels — replace the old stop-labels row */}
      <div
        className="grid font-mono text-[length:var(--fs-label)] leading-none tabular-nums"
        style={{ gridTemplateColumns: `repeat(${SLIDER_MAX + 1}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {Array.from({ length: SLIDER_MAX + 1 }, (_, i) => {
          const isActive = i === altitudeBandIndex;
          const color = isActive && i > 0 ? ALTITUDE_BANDS[i - 1]?.color : undefined;
          return (
            <span
              key={i}
              className={`text-center transition-colors ${isActive ? "font-bold" : "text-[color:var(--t-tertiary)]"}`}
              style={
                isActive
                  ? { color: color ?? "var(--t-primary)" }
                  : undefined
              }
            >
              {bandTickLabel(i, flightAltitudeLegendUnit)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
