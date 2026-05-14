"use client";

import {
  ALTITUDE_BANDS,
  FLIGHT_ALTITUDE_LEGEND_STOPS,
  flightAltitudeLegendGradientCss,
  flightAltitudeLegendStopLabel,
} from "@/lib/map/flightAltitudeColor";
import { useMoonTransitStore } from "@/stores/moon-transit-store";

const legendCheckboxClass =
  "mt-0.5 h-4 w-4 shrink-0 rounded border border-white/15 bg-[color:var(--glass-1)] accent-[color:var(--mint)] text-[color:var(--mint)] outline-none focus:ring-2 focus:ring-sky-500/35 focus:ring-offset-0 sm:mt-0";

const BAND_COUNT = ALTITUDE_BANDS.length; // 6
const SLIDER_MAX = BAND_COUNT;            // 0=All, 1–6=band

/** Tick labels: "All" + ft label for each band start. */
const SLIDER_TICK_LABELS = ["All", "0", "5k", "15k", "25k", "35k", "45k+"] as const;

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
  const lastStopIndex = FLIGHT_ALTITUDE_LEGEND_STOPS.length - 1;

  const activeBand = altitudeBandIndex > 0 ? ALTITUDE_BANDS[altitudeBandIndex - 1] : null;
  const sliderAccent = activeBand?.color ?? "#94a3b8";

  return (
    <div
      data-testid="flight-altitude-legend"
      className={`pointer-events-none flex min-w-0 flex-1 flex-col gap-1.5 mt-glass-elevated rounded-[var(--r-xl)] px-3 py-2 text-[length:var(--fs-meta)] leading-normal text-[color:var(--t-secondary)] max-md:min-h-0 max-md:gap-1 max-md:py-1.5 max-md:pr-2.5 md:max-w-md md:gap-2 md:py-2.5 md:pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] md:absolute md:bottom-[4.5rem] md:left-[6rem] md:right-auto md:z-10 ${selectedFlightId != null ? "max-md:hidden" : ""}`}
    >
      {/* Row: checkbox + unit toggle */}
      <div className="pointer-events-auto flex min-w-0 items-start gap-3 sm:items-center">
        <label className="flex min-w-0 flex-1 cursor-pointer touch-manipulation items-start gap-2 select-none sm:items-center">
          <input
            type="checkbox"
            className={legendCheckboxClass}
            checked={mapAircraftAltitudeColors}
            onChange={(e) => setMapAircraftAltitudeColors(e.target.checked)}
            data-testid="flight-altitude-colors-toggle"
            aria-label="Color aircraft markers by altitude (MSL). When off, a single neutral tone is used except shot-feasible flights stay green."
          />
          <span className="min-w-0 text-[length:var(--fs-body-strong)] font-semibold leading-snug tracking-wide text-[color:var(--t-primary)] sm:text-[length:var(--fs-body)]">
            Aircraft color by altitude (MSL)
          </span>
        </label>
        <div
          className="shrink-0 pt-0.5 sm:pt-0"
          role="group"
          aria-label="Altitude legend tick unit"
        >
          <div className="inline-flex rounded-[var(--r-sm)] border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)] p-0.5 shadow-[var(--shadow-1)]">
            {(["km", "ft"] as const).map((u) => {
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

      {/* Gradient bar */}
      <div className="relative">
        <div
          className={`h-3 w-full rounded-md ring-1 ring-inset ring-white/[0.08] transition-opacity ${mapAircraftAltitudeColors ? "opacity-100" : "opacity-35"}`}
          style={{ background: flightAltitudeLegendGradientCss() }}
          aria-hidden
        />
        {activeBand && mapAircraftAltitudeColors && (
          <div
            className="pointer-events-none absolute inset-0 rounded-md"
            style={{ boxShadow: `inset 0 0 0 2px ${activeBand.color}` }}
            aria-hidden
          />
        )}
      </div>

      {/* Stop labels (km/ft toggle) */}
      <div
        className={`grid grid-cols-6 gap-x-1 font-mono text-[length:var(--fs-label)] font-medium tabular-nums leading-none tracking-tight text-[color:var(--t-secondary)] transition-opacity sm:text-[length:var(--fs-meta)] sm:tracking-normal ${mapAircraftAltitudeColors ? "" : "text-[color:var(--t-tertiary)] opacity-70"}`}
        aria-hidden
      >
        {FLIGHT_ALTITUDE_LEGEND_STOPS.map((x, i) => (
          <span key={x.altMeters} className="whitespace-nowrap text-center">
            {flightAltitudeLegendStopLabel(
              x,
              flightAltitudeLegendUnit,
              i === lastStopIndex
            )}
          </span>
        ))}
      </div>

      {/* Altitude band filter slider */}
      <div className="pointer-events-auto flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">Filter FL</span>
          {activeBand ? (
            <span
              className="truncate text-[length:var(--fs-label)] font-medium"
              style={{ color: activeBand.color }}
            >
              {activeBand.ftLabel} · {activeBand.category}
            </span>
          ) : (
            <span className="text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">All flight levels</span>
          )}
          {activeBand && (
            <button
              type="button"
              className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[length:var(--fs-label)] font-medium text-[color:var(--t-tertiary)] transition hover:bg-white/[0.05] hover:text-[color:var(--t-secondary)]"
              onClick={() => setAltitudeBandIndex(0)}
              aria-label="Reset altitude filter to All"
            >
              Reset
            </button>
          )}
        </div>
        <div className="relative min-w-0">
          <input
            type="range"
            min={0}
            max={SLIDER_MAX}
            step={1}
            value={altitudeBandIndex}
            onChange={(e) => setAltitudeBandIndex(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer"
            style={{ accentColor: sliderAccent }}
            aria-label="Filter flights by altitude band. 0 = All, 1–6 = specific band."
            data-testid="altitude-band-slider"
          />
          {/* Tick labels */}
          <div
            className="mt-0.5 grid font-mono text-[0.5rem] leading-none tabular-nums text-[color:var(--t-tertiary)]"
            style={{ gridTemplateColumns: `repeat(${SLIDER_MAX + 1}, minmax(0, 1fr))` }}
            aria-hidden
          >
            {SLIDER_TICK_LABELS.map((label, i) => (
              <span
                key={i}
                className={`text-center transition-colors ${i === altitudeBandIndex ? "font-bold" : ""}`}
                style={
                  i === altitudeBandIndex && i > 0
                    ? { color: ALTITUDE_BANDS[i - 1]?.color }
                    : i === 0 && altitudeBandIndex === 0
                    ? { color: "var(--t-primary)" }
                    : undefined
                }
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
