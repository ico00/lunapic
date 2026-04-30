"use client";

import {
  flightAircraftTypeDisplayLine,
  flightAirlineDisplayLine,
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

const MAP_LEGEND_COPY = (
  <>
    Cyan band + pale center line: the ground strip and{" "}
    <strong className="font-semibold text-sky-100/90">zero-offset</strong> line
    (3D line-of-sight, aircraft altitude) for the{" "}
    <strong className="font-semibold text-sky-100/90">current slider time</strong>{" "}
    only — the direction you move along the ground to line up the hull with the
    moon’s center at your fixed observer. Zoom out if the band is off-screen.
  </>
);

export type SelectedAircraftPopupContentProps = {
  flight: FlightState | null;
  onDismiss: () => void;
};

/** Sadržaj za Mapbox `Popup` / odabranog zrakoplova (bez podloge karte). */
export function SelectedAircraftPopupContent({
  flight,
  onDismiss,
}: SelectedAircraftPopupContentProps) {
  const hasMounted = useHasMounted();

  return (
    <div
      className="pointer-events-auto overflow-y-auto rounded-2xl border border-sky-800/50 bg-sky-950/95 p-2.5 text-zinc-200 shadow-xl shadow-black/40 backdrop-blur max-md:max-h-[min(32dvh,14.5rem)] max-md:w-[calc(100dvw-1rem-env(safe-area-inset-left)-env(safe-area-inset-right))] max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-2xl max-md:border-white/10 max-md:bg-zinc-950/98 max-md:shadow-2xl md:max-h-[34rem] md:w-[min(18rem,calc(100vw-2.25rem))] md:p-3"
      data-testid="selected-flight-card"
    >
      <div className="flex items-start justify-between gap-2 md:items-start">
        {flight ? (
          <div className="min-w-0 flex-1 md:hidden">
            <p className="truncate font-mono text-[0.95rem] font-semibold leading-tight tracking-tight text-amber-100/95">
              {flight.callSign?.trim() || "—"}
            </p>
            <p className="mt-0.5 truncate text-[0.65rem] text-zinc-400">
              {flightAirlineDisplayLine(flight) ?? "—"}
            </p>
          </div>
        ) : (
          <h2 className="text-xs font-medium uppercase tracking-wide text-sky-400/90 md:hidden">
            Selected aircraft
          </h2>
        )}
        <h2 className="hidden text-xs font-medium uppercase tracking-wide text-sky-400/90 md:block">
          Selected aircraft
        </h2>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-[0.65rem] text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300 max-md:border max-md:border-white/10 max-md:bg-zinc-900/60 max-md:py-0.5"
          aria-label="Clear aircraft selection"
        >
          Clear
        </button>
      </div>
      {!flight ? (
        <p className="mt-2 text-sm text-zinc-500">
          No live data for this id (moved off map or stale selection). Pick
          another track or refresh flights.
        </p>
      ) : (
        <>
          {/* Desktop: full legend + definition list */}
          <p className="mt-2 hidden text-xs leading-snug text-sky-200/80 md:block">
            {MAP_LEGEND_COPY}
          </p>
          <dl className="mt-3 hidden space-y-1.5 text-sm md:block">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <dt className="text-zinc-500">Airline</dt>
              <dd className="max-w-[65%] text-right text-[0.72rem] text-sky-100/90">
                {flightAirlineDisplayLine(flight) ?? "—"}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <dt className="text-zinc-500">Aircraft type</dt>
              <dd className="max-w-[65%] text-right font-mono text-[0.72rem] text-zinc-300">
                {flightAircraftTypeDisplayLine(flight) ?? "—"}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <dt className="text-zinc-500">Call sign</dt>
              <dd className="font-mono text-sky-200">
                {flight.callSign?.trim() || "—"}
              </dd>
            </div>
            {flight.icao24 != null && flight.icao24 !== "" && (
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                <dt className="text-zinc-500">ICAO24</dt>
                <dd className="font-mono text-xs text-zinc-300">
                  {flight.icao24}
                </dd>
              </div>
            )}
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
              <dt className="text-[0.65rem] text-zinc-500">State time</dt>
              <dd
                className="mt-0.5 font-mono text-[0.7rem] tabular-nums text-zinc-400"
                suppressHydrationWarning
              >
                {hasMounted ? fmtDataTimestamp(flight.timestamp) : "—"}
              </dd>
            </div>
          </dl>

          {/* Mobile: compact Flightradar-style strip */}
          <div className="mt-2 md:hidden">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/70 px-2 py-1">
                <div className="text-[0.55rem] font-medium uppercase tracking-wide text-zinc-500">
                  Altitude
                </div>
                <div className="mt-0.5 truncate font-mono text-[0.68rem] tabular-nums leading-none text-zinc-100">
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
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/70 px-2 py-1">
                <div className="text-[0.55rem] font-medium uppercase tracking-wide text-zinc-500">
                  Position
                </div>
                <div className="mt-0.5 truncate font-mono text-[0.62rem] tabular-nums leading-none text-zinc-300">
                  {formatFixed(flight.position.lat, 3)}°,{" "}
                  {formatFixed(flight.position.lng, 3)}°
                </div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5 text-[0.6rem] text-zinc-500">
              <span className="min-w-0 truncate">
                {flightAircraftTypeDisplayLine(flight) ?? "—"}
              </span>
              {flight.icao24 != null && flight.icao24 !== "" ? (
                <span className="shrink-0 font-mono text-zinc-400">
                  {flight.icao24}
                </span>
              ) : null}
            </div>
            <div className="mt-1 border-t border-white/[0.06] pt-1">
              <p
                className="font-mono text-[0.58rem] tabular-nums text-zinc-500"
                suppressHydrationWarning
              >
                {hasMounted ? fmtDataTimestamp(flight.timestamp) : "—"}
              </p>
            </div>
            <details className="mt-1.5 rounded-lg border border-white/[0.06] bg-zinc-900/40 px-2 py-1">
              <summary className="cursor-pointer list-none text-[0.62rem] font-medium text-sky-300/90 [&::-webkit-details-marker]:hidden">
                Map legend
              </summary>
              <p className="mt-1.5 border-t border-white/[0.05] pt-1.5 text-[0.62rem] leading-snug text-sky-200/75">
                {MAP_LEGEND_COPY}
              </p>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
