"use client";

import {
  FLIGHT_ALTITUDE_LEGEND_STOPS,
  flightAltitudeLegendGradientCss,
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
  const mapAircraftAltitudeColors = useMoonTransitStore(
    (s) => s.mapAircraftAltitudeColors
  );
  const setMapAircraftAltitudeColors = useMoonTransitStore(
    (s) => s.setMapAircraftAltitudeColors
  );

  return (
    <div
      data-testid="flight-altitude-legend"
      className={`pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex max-w-md flex-col gap-2 ${shellGlassPanelClass} px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] text-sm leading-normal text-zinc-200 md:left-auto md:right-14`}
    >
      <div className="text-sm font-semibold tracking-wide text-zinc-100 sm:text-base">
        Aircraft color by altitude (MSL)
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
        {FLIGHT_ALTITUDE_LEGEND_STOPS.map((x) => (
          <span key={x.altMeters} className="whitespace-nowrap text-center">
            {x.label}
          </span>
        ))}
      </div>
      <label className="pointer-events-auto flex cursor-pointer touch-manipulation items-center gap-2.5 select-none text-sm text-zinc-300">
        <input
          type="checkbox"
          className={shellAccentCheckboxClass}
          checked={mapAircraftAltitudeColors}
          onChange={(e) => setMapAircraftAltitudeColors(e.target.checked)}
          data-testid="flight-altitude-colors-toggle"
          aria-label="Color aircraft markers by altitude (MSL). When off, a single neutral tone is used except shot-feasible flights stay green."
        />
        <span>Color by altitude</span>
      </label>
    </div>
  );
}
