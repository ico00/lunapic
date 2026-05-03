"use client";

import { useState } from "react";
import {
  flightAirlineDisplayLine,
  flightAirlineLogoKiwiIata,
} from "@/lib/flight/flightDisplayLabels";
import { formatFixed, mpsToKnots } from "@/lib/format/numbers";
import { useHasMounted } from "@/hooks/useHasMounted";
import type { FlightState } from "@/types/flight";

function fmtDataTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** English UI copy when the feed omits value (all providers). */
const AIRCRAFT_TYPE_FALLBACK = "N/A";
const ICAO24_FALLBACK = "N/A";

function AirlineLogoSlot({ iata }: { readonly iata: string | null }) {
  const [broken, setBroken] = useState(false);
  const src =
    iata != null && iata.length >= 2
      ? `https://images.kiwi.com/airlines/64x64/${iata.toUpperCase()}.png`
      : null;

  const placeholder = !src || broken;

  return (
    <div
      className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-zinc-900/90 md:h-[3.75rem] md:w-[3.75rem]"
      data-testid="selected-flight-airline-logo-slot"
      aria-hidden
    >
      {placeholder ? (
        <span className="absolute inset-1 rounded border border-dashed border-zinc-600/80 bg-zinc-950/40" />
      ) : (
        <img
          src={src}
          alt=""
          width={64}
          height={64}
          className="relative z-[1] max-h-[calc(100%-0.35rem)] max-w-[calc(100%-0.35rem)] object-contain p-0.5"
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

function altBlock(f: FlightState): string {
  const baro = f.baroAltitudeMeters;
  const geo = f.geoAltitudeMeters;
  if (baro == null && geo == null) {
    return "—";
  }
  const parts: string[] = [];
  if (baro != null) {
    parts.push(`baro ${formatFixed(baro, 0)} m`);
  }
  if (geo != null) {
    parts.push(`geo ${formatFixed(geo, 0)} m`);
  }
  return parts.join(" · ");
}

export type SelectedAircraftPopupContentProps = {
  flight: FlightState | null;
  onDismiss: () => void;
  /** Ponovno dohvati live letove za trenutni koridor karte (bez punog reloada stranice). */
  onRefreshFlights?: () => void;
};

const clearSelectionButtonClass =
  "shrink-0 rounded-lg px-2 py-1 text-[0.65rem] text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300 max-md:border max-md:border-white/10 max-md:bg-zinc-900/60 max-md:py-0.5";

function IconRefreshFlights(props: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={props.className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

/** Sadržaj za Mapbox `Popup` / odabranog zrakoplova (bez podloge karte). */
export function SelectedAircraftPopupContent({
  flight,
  onDismiss,
  onRefreshFlights,
}: SelectedAircraftPopupContentProps) {
  const hasMounted = useHasMounted();
  const typeDisplay = flight
    ? flight.aircraftType?.trim() || AIRCRAFT_TYPE_FALLBACK
    : "";
  const icaoDisplay = flight
    ? flight.icao24?.trim().toUpperCase() || ICAO24_FALLBACK
    : "";
  const logoIata = flight ? flightAirlineLogoKiwiIata(flight) : null;

  return (
    <div
      className="pointer-events-auto box-border overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950/98 p-2.5 text-zinc-200 shadow-xl shadow-black/45 backdrop-blur max-md:max-h-[min(52dvh,24rem)] max-md:w-full max-md:min-w-0 max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-lg max-md:border-x-0 max-md:border-t max-md:border-b-0 max-md:border-zinc-800 max-md:bg-black/92 max-md:pb-1 max-md:shadow-none max-md:backdrop-blur-2xl md:max-h-[34rem] md:w-[min(18rem,calc(100vw-2.25rem))] md:p-3"
      data-testid="selected-flight-card"
    >
      <div className="flex items-center justify-between gap-2">
        {flight ? (
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
              <div className="shrink-0">
                <AirlineLogoSlot
                  key={`${flight.id}-${logoIata ?? ""}`}
                  iata={logoIata}
                />
              </div>
              <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-tight">
                <p className="break-words text-[0.72rem] text-zinc-400 md:text-[0.8rem]">
                  {flightAirlineDisplayLine(flight) ?? "—"}
                </p>
                <p className="break-all font-mono text-[1.05rem] font-bold tracking-tight text-yellow-400 md:text-[1.15rem]">
                  {flight.callSign?.trim() || "—"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <h2 className="text-xs font-medium uppercase tracking-wide text-blue-400/90">
            Selected aircraft
          </h2>
        )}
        {flight && onRefreshFlights ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onRefreshFlights}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/80 hover:text-sky-300 md:hidden"
              aria-label="Refresh flight data"
              title="Refresh flight data"
              data-testid="selected-flight-refresh-flights"
            >
              <IconRefreshFlights className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
      {!flight ? (
        <div className="mt-2">
          <p className="text-sm text-zinc-500">
            No live data for this id (moved off map or stale selection). Pick
            another track or refresh flights.
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onDismiss}
              className={clearSelectionButtonClass}
              aria-label="Clear aircraft selection"
              data-testid="selected-flight-clear"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <>
          <dl className="mt-2 hidden space-y-1.5 text-sm md:block">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <dt className="shrink-0 text-zinc-500">Aircraft type</dt>
              <dd className="min-w-0 break-words text-end font-mono text-[0.7rem] tabular-nums text-zinc-300">
                {typeDisplay}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <dt className="shrink-0 text-zinc-500">ICAO24</dt>
              <dd className="min-w-0 break-all text-end font-mono text-[0.7rem] tabular-nums text-zinc-300">
                {icaoDisplay}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <dt className="text-zinc-500">Position (on map)</dt>
              <dd className="font-mono text-[0.7rem] tabular-nums text-zinc-300">
                {formatFixed(flight.position.lat, 4)}°,{" "}
                {formatFixed(flight.position.lng, 4)}°
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <dt className="text-zinc-500">Altitude</dt>
              <dd className="font-mono text-[0.7rem] text-zinc-300">
                {altBlock(flight)}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <dt className="text-zinc-500">Ground speed</dt>
              <dd className="font-mono text-[0.7rem] tabular-nums text-zinc-300">
                {flight.groundSpeedMps != null
                  ? `${formatFixed(mpsToKnots(flight.groundSpeedMps), 0)} kt`
                  : "—"}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <dt className="text-zinc-500">Track</dt>
              <dd className="font-mono text-[0.7rem] tabular-nums text-zinc-300">
                {flight.trackDeg != null
                  ? `${formatFixed(flight.trackDeg, 1)}°`
                  : "—"}
              </dd>
            </div>
            <div className="border-t border-zinc-800/80 pt-2">
              <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <dt className="text-[0.65rem] text-zinc-500">State time</dt>
                  <dd
                    className="mt-0.5 font-mono text-[0.7rem] tabular-nums text-zinc-400"
                    suppressHydrationWarning
                  >
                    {hasMounted ? fmtDataTimestamp(flight.timestamp) : "—"}
                  </dd>
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  className={clearSelectionButtonClass}
                  aria-label="Clear aircraft selection"
                  data-testid="selected-flight-clear"
                >
                  Clear
                </button>
              </div>
            </div>
          </dl>

          {/* Mobile: compact Flightradar-style strip */}
          <div className="mt-2 md:hidden">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="col-span-2 rounded-lg border border-white/[0.06] bg-zinc-900/70 px-2 py-1">
                <div className="text-[0.55rem] font-medium uppercase tracking-wide text-zinc-500">
                  Aircraft type
                </div>
                <div className="mt-0.5 break-all font-mono text-[0.68rem] tabular-nums leading-snug text-zinc-100">
                  {typeDisplay}
                </div>
              </div>
              <div className="col-span-2 rounded-lg border border-white/[0.06] bg-zinc-900/70 px-2 py-1">
                <div className="text-[0.55rem] font-medium uppercase tracking-wide text-zinc-500">
                  ICAO24
                </div>
                <div className="mt-0.5 break-all font-mono text-[0.68rem] tabular-nums leading-snug text-zinc-100">
                  {icaoDisplay}
                </div>
              </div>
              <div className="col-span-2 rounded-lg border border-white/[0.06] bg-zinc-900/70 px-2 py-1">
                <div className="text-[0.55rem] font-medium uppercase tracking-wide text-zinc-500">
                  Altitude
                </div>
                <div className="mt-0.5 break-words font-mono text-[0.68rem] tabular-nums leading-snug text-zinc-100">
                  {altBlock(flight)}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/70 px-2 py-1">
                <div className="text-[0.55rem] font-medium uppercase tracking-wide text-zinc-500">
                  Ground speed
                </div>
                <div className="mt-0.5 font-mono text-[0.68rem] tabular-nums leading-none text-zinc-100">
                  {flight.groundSpeedMps != null
                    ? `${formatFixed(mpsToKnots(flight.groundSpeedMps), 0)} kt`
                    : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/70 px-2 py-1">
                <div className="text-[0.55rem] font-medium uppercase tracking-wide text-zinc-500">
                  Track
                </div>
                <div className="mt-0.5 font-mono text-[0.68rem] tabular-nums leading-none text-zinc-100">
                  {flight.trackDeg != null
                    ? `${formatFixed(flight.trackDeg, 1)}°`
                    : "—"}
                </div>
              </div>
              <div className="col-span-2 rounded-lg border border-white/[0.06] bg-zinc-900/70 px-2 py-1">
                <div className="text-[0.55rem] font-medium uppercase tracking-wide text-zinc-500">
                  Position
                </div>
                <div className="mt-0.5 break-words font-mono text-[0.62rem] tabular-nums leading-snug text-zinc-300">
                  {formatFixed(flight.position.lat, 3)}°,{" "}
                  {formatFixed(flight.position.lng, 3)}°
                </div>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1">
              <p
                className="min-w-0 font-mono text-[0.58rem] tabular-nums text-zinc-500"
                suppressHydrationWarning
              >
                {hasMounted ? fmtDataTimestamp(flight.timestamp) : "—"}
              </p>
              <button
                type="button"
                onClick={onDismiss}
                className={clearSelectionButtonClass}
                aria-label="Clear aircraft selection"
                data-testid="selected-flight-clear"
              >
                Clear
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
