"use client";

import { useState } from "react";
import {
  flightAirlineDisplayLine,
  flightAirlineLogoKiwiIata,
} from "@/lib/flight/flightDisplayLabels";
import { formatFixed, mpsToKnots } from "@/lib/format/numbers";
import { useHasMounted } from "@/hooks/useHasMounted";
import {
  computeContrailLikelihood,
  type ContrailLikelihood,
} from "@/lib/domain/contrail/contrailService";
import { useWeatherStore } from "@/stores/weather-store";
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
      className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)] md:h-[3.75rem] md:w-[3.75rem]"
      data-testid="selected-flight-airline-logo-slot"
      aria-hidden
    >
      {placeholder ? (
        <span className="absolute inset-1 rounded-xl border border-dashed border-[color:var(--glass-stroke-strong)] bg-[color:var(--glass-1)]/50" />
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

const CONTRAIL_LABEL: Record<ContrailLikelihood, string> = {
  none: "Unlikely",
  transient: "Possible (short-lived)",
  persistent: "Likely (persistent)",
};

const CONTRAIL_COLOR: Record<ContrailLikelihood, string> = {
  none: "text-[color:var(--t-secondary)]",
  transient: "text-yellow-400",
  persistent: "text-orange-400",
};

/** Sadržaj za Mapbox `Popup` / odabranog zrakoplova (bez podloge karte). */
export function SelectedAircraftPopupContent({
  flight,
  onDismiss,
  onRefreshFlights,
}: SelectedAircraftPopupContentProps) {
  // onRefreshFlights ostaje u props tipu radi kompatibilnosti, ali se ne koristi
  // — refresh ikonica je uklonjena, live feed sam osvježava podatke.
  void onRefreshFlights;
  const [collapsed, setCollapsed] = useState(false);
  const hasMounted = useHasMounted();
  const atmosphericLevels = useWeatherStore((s) => s.atmosphericLevels);
  const typeDisplay = flight
    ? flight.aircraftType?.trim() || AIRCRAFT_TYPE_FALLBACK
    : "";
  const icaoDisplay = flight
    ? flight.icao24?.trim().toUpperCase() || ICAO24_FALLBACK
    : "";
  const logoIata = flight ? flightAirlineLogoKiwiIata(flight) : null;
  const contrail =
    flight != null && atmosphericLevels != null
      ? computeContrailLikelihood(flight.baroAltitudeMeters, atmosphericLevels)
      : null;

  return (
    <div
      className="pointer-events-auto mt-glass-elevated box-border max-md:max-h-[min(50dvh,22rem)] max-md:w-full max-md:min-w-0 max-md:max-w-none max-md:rounded-b-[var(--r-xl)] max-md:pb-2 md:max-h-[34rem] md:w-[min(20rem,calc(100vw-2.25rem))] overflow-y-auto rounded-[var(--r-xl)] p-2.5 text-[color:var(--t-secondary)] [scrollbar-width:none] md:p-3 [&::-webkit-scrollbar]:hidden"
      data-testid="selected-flight-card"
    >
      <div className="flex items-center gap-2">
        {flight ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand aircraft details" : "Collapse aircraft details"}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left md:gap-3 active:opacity-70"
          >
            <div className="shrink-0">
              <AirlineLogoSlot
                key={`${flight.id}-${logoIata ?? ""}`}
                iata={logoIata}
              />
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-0.5 leading-tight">
              <p className="break-words text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
                {flightAirlineDisplayLine(flight) ?? "—"}
              </p>
              <p className="break-all text-[length:var(--fs-h2)] font-bold tracking-tight text-sky-300 md:text-[length:var(--fs-h1)] md:font-bold">
                {flight.callSign?.trim() || "—"}
              </p>
            </div>
            <svg
              className={`h-4 w-4 shrink-0 text-[color:var(--t-tertiary)] transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ) : (
          <h2 className="mt-section-label min-w-0 flex-1 border-0 pb-0 text-sky-400/90">
            Selected aircraft
          </h2>
        )}
        {/* X close gumb */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Clear aircraft selection"
          title="Close"
          data-testid="selected-flight-clear"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)] text-[color:var(--t-secondary)] transition hover:border-sky-400/35 hover:bg-[color:var(--glass-2)] hover:text-[color:var(--t-primary)] active:scale-[0.95]"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {!flight ? (
        <div className="mt-2">
          <p className="text-[length:var(--fs-meta)] leading-relaxed text-[color:var(--t-tertiary)]">
            No live data for this id (moved off map or stale selection). Pick
            another track or refresh flights.
          </p>
        </div>
      ) : !collapsed ? (
        <>
          <div className="mt-2 md:mt-2.5">
            <div className="grid grid-cols-2 gap-1.5 md:gap-2">
              <div className="min-w-0 rounded-xl border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)]/80 px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-tertiary)]">
                  Aircraft type
                </div>
                <div
                  className="mt-0.5 break-words font-mono text-[length:var(--fs-meta)] leading-snug text-[color:var(--t-primary)]"
                  title={typeDisplay}
                >
                  {typeDisplay}
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)]/80 px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-tertiary)]">
                  ICAO24
                </div>
                <div className="mt-0.5 truncate font-mono text-[length:var(--fs-meta)] tabular-nums leading-snug text-[color:var(--t-primary)]">
                  {icaoDisplay}
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)]/80 px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-tertiary)]">
                  Speed
                </div>
                <div className="mt-0.5 truncate font-mono text-[length:var(--fs-meta)] tabular-nums leading-snug text-[color:var(--t-primary)]">
                  {flight.groundSpeedMps != null
                    ? `${formatFixed(mpsToKnots(flight.groundSpeedMps), 0)} kt`
                    : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)]/80 px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-tertiary)]">
                  Track
                </div>
                <div className="mt-0.5 truncate font-mono text-[length:var(--fs-meta)] tabular-nums leading-snug text-[color:var(--t-primary)]">
                  {flight.trackDeg != null
                    ? `${formatFixed(flight.trackDeg, 1)}°`
                    : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)]/80 px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-tertiary)]">
                  Altitude
                </div>
                <div className="mt-0.5 break-words font-mono text-[length:var(--fs-meta)] tabular-nums leading-snug text-[color:var(--t-primary)]">
                  {altBlock(flight)}
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)]/80 px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-tertiary)]">
                  Contrails
                </div>
                <div
                  className={`mt-0.5 font-mono text-[length:var(--fs-meta)] leading-snug ${contrail != null ? CONTRAIL_COLOR[contrail] : "text-[color:var(--t-tertiary)]"}`}
                >
                  {contrail != null ? CONTRAIL_LABEL[contrail] : "—"}
                </div>
              </div>
              <div className="col-span-2 min-w-0 rounded-xl border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)]/80 px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-tertiary)]">
                  Position
                </div>
                <div className="mt-0.5 break-words font-mono text-[length:var(--fs-meta)] tabular-nums leading-snug text-[color:var(--t-secondary)]">
                  {formatFixed(flight.position.lat, 3)}°,{" "}
                  {formatFixed(flight.position.lng, 3)}°
                </div>
              </div>
            </div>
            <p
              className="mt-2 border-t border-[color:var(--glass-stroke)] pt-2 text-center font-mono text-[length:var(--fs-label)] tabular-nums text-[color:var(--t-tertiary)]"
              suppressHydrationWarning
              title="Time when this aircraft state was reported by the feed"
            >
              {hasMounted ? fmtDataTimestamp(flight.timestamp) : "—"}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
