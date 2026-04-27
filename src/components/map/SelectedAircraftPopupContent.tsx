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
      className="pointer-events-auto max-w-[min(18rem,calc(100vw-2.25rem))] rounded-2xl border border-sky-800/50 bg-sky-950/95 p-3 text-zinc-200 shadow-xl shadow-black/40 backdrop-blur"
      data-testid="selected-flight-card"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-sky-400/90">
          Selected aircraft
        </h2>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded px-2 py-0.5 text-[0.65rem] text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
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
          <p className="mt-2 text-xs leading-snug text-sky-200/80">
            Cyan band + pale center line: the ground strip and **zero-offset**
            line (3D line-of-sight, aircraft altitude) for the **current slider
            time** only — the direction you move along the ground to line up
            the hull with the moon’s center at your fixed observer. Zoom out if
            the band is off-screen.
          </p>
          <dl className="mt-3 space-y-1.5 text-sm">
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
        </>
      )}
    </div>
  );
}
