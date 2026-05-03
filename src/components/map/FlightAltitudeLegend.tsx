"use client";

import {
  FLIGHT_ALTITUDE_LEGEND_STOPS,
  flightAltitudeLegendGradientCss,
  flightAltitudeLegendStopLabel,
} from "@/lib/map/flightAltitudeColor";
import {
  shellAccentCheckboxClass,
  shellGlassPanelClass,
} from "@/lib/ui/shellComboboxStyles";
import { useMoonTransitStore } from "@/stores/moon-transit-store";

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

  const lastStopIndex = FLIGHT_ALTITUDE_LEGEND_STOPS.length - 1;

  return (
    <div
      data-testid="flight-altitude-legend"
      className={`pointer-events-none flex max-w-md flex-col gap-1.5 ${shellGlassPanelClass} px-3 py-2 text-sm leading-normal text-zinc-200 max-md:fixed max-md:inset-x-3 max-md:bottom-[calc(4.35rem+env(safe-area-inset-bottom,0px))] max-md:z-[72] max-md:mx-auto max-md:max-w-md max-md:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] md:absolute md:bottom-3 md:left-auto md:right-14 md:z-10 md:gap-2 md:py-2.5 md:pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] ${selectedFlightId != null ? "max-md:hidden" : ""}`}
    >
      <div className="pointer-events-auto flex min-w-0 items-start gap-3 sm:items-center">
        <label className="flex min-w-0 flex-1 cursor-pointer touch-manipulation items-start gap-2 select-none sm:items-center">
          <input
            type="checkbox"
            className={`${shellAccentCheckboxClass} mt-0.5 shrink-0 sm:mt-0`}
            checked={mapAircraftAltitudeColors}
            onChange={(e) => setMapAircraftAltitudeColors(e.target.checked)}
            data-testid="flight-altitude-colors-toggle"
            aria-label="Color aircraft markers by altitude (MSL). When off, a single neutral tone is used except shot-feasible flights stay green."
          />
          <span className="min-w-0 text-sm font-semibold leading-snug tracking-wide text-zinc-100 sm:text-base">
            Aircraft color by altitude (MSL)
          </span>
        </label>
        <div
          className="shrink-0 pt-0.5 sm:pt-0"
          role="group"
          aria-label="Altitude legend tick unit"
        >
          <div className="inline-flex rounded-md border border-zinc-600/70 bg-zinc-900/90 p-0.5 shadow-inner ring-1 ring-inset ring-zinc-800/80">
            {(["km", "ft"] as const).map((u) => {
              const active = flightAltitudeLegendUnit === u;
              return (
                <button
                  key={u}
                  type="button"
                  className={
                    active
                      ? "min-w-[2.25rem] rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-900 shadow-sm bg-zinc-100"
                      : "min-w-[2.25rem] rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 transition hover:bg-zinc-800/90 hover:text-zinc-200"
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
      <div
        className={`h-3 w-full rounded-sm ring-1 ring-inset ring-zinc-600/60 transition-opacity ${mapAircraftAltitudeColors ? "opacity-100" : "opacity-35"}`}
        style={{ background: flightAltitudeLegendGradientCss() }}
        aria-hidden
      />
      <div
        className={`grid grid-cols-6 gap-x-1 font-mono text-xs font-medium tabular-nums leading-none tracking-tight text-zinc-300 transition-opacity sm:text-sm sm:tracking-normal ${mapAircraftAltitudeColors ? "" : "text-zinc-500 opacity-60"}`}
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
    </div>
  );
}
