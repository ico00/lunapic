"use client";

import { useState } from "react";
import {
  flightAirlineDisplayLine,
  flightAirlineLogoKiwiIata,
} from "@/lib/flight/flightDisplayLabels";
import { formatFixed, mpsToKnots } from "@/lib/format/numbers";
import {
  computeContrailLikelihood,
  type ContrailLikelihood,
} from "@/lib/domain/contrail/contrailService";
import { useWeatherStore } from "@/stores/weather-store";
import type { FlightState } from "@/types/flight";

function providerLabel(id: string): string {
  if (id === "adsbone") return "adsb.lol";
  if (id === "localsdr") return "LunaPic ADS-B";
  if (id === "avionix") return "Avionix Nano";
  if (id === "opensky") return "OpenSky";
  return id;
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
      className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--ground)] md:h-[3.75rem] md:w-[3.75rem]"
      data-testid="selected-flight-airline-logo-slot"
      aria-hidden
    >
      {placeholder ? (
        <span className="absolute inset-1 rounded-[var(--r-ctl)] border border-dashed border-[color:var(--hair)]" />
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
  none: "text-[color:var(--ink-2)]",
  transient: "text-[color:var(--ink)]",
  persistent: "text-[color:var(--disc-text)]",
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
      className="pointer-events-auto mt-glass-elevated box-border max-md:max-h-[min(50dvh,22rem)] max-md:w-full max-md:min-w-0 max-md:max-w-none max-md:rounded-b-[var(--r-panel)] max-md:pb-2 md:max-h-[calc(100dvh-26rem)] md:w-[min(20rem,calc(100vw-2.25rem))] overflow-y-auto rounded-[var(--r-panel)] p-2.5 text-[color:var(--t-secondary)] [scrollbar-width:none] md:p-3 [&::-webkit-scrollbar]:hidden"
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
              <p className="break-words text-[length:var(--fs-meta)] text-[color:var(--ink-3)]">
                {flightAirlineDisplayLine(flight) ?? "—"}
              </p>
              <p className="break-all text-[length:var(--fs-h2)] font-extrabold tracking-tight text-[color:var(--ink)] md:text-[length:var(--fs-h1)]">
                {flight.callSign?.trim() || "—"}
              </p>
            </div>
            <svg
              className={`h-4 w-4 shrink-0 text-[color:var(--t-tertiary)] transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
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
          <h2 className="mt-section-label min-w-0 flex-1 border-0 pb-0">
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
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--panel-2)] text-[color:var(--ink-2)] transition-[border-color,transform] duration-150 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] [@media(hover:hover)_and_(pointer:fine)]:hover:border-[color:var(--ink-3)]"
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
              <div className="min-w-0 rounded-[var(--r-ctl)] border border-[color:var(--hair-soft)] bg-[color:var(--ground)] px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">
                  Aircraft type
                </div>
                <div
                  className="mt-0.5 break-words font-bold text-[length:var(--fs-meta)] leading-snug text-[color:var(--ink)]"
                  title={typeDisplay}
                >
                  {typeDisplay}
                </div>
              </div>
              <div className="min-w-0 rounded-[var(--r-ctl)] border border-[color:var(--hair-soft)] bg-[color:var(--ground)] px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">
                  ICAO24
                </div>
                <div className="mt-0.5 truncate font-bold text-[length:var(--fs-meta)] leading-snug text-[color:var(--ink)]">
                  {icaoDisplay}
                </div>
              </div>
              <div className="min-w-0 rounded-[var(--r-ctl)] border border-[color:var(--hair-soft)] bg-[color:var(--ground)] px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">
                  Speed
                </div>
                <div className="mt-0.5 truncate font-bold text-[length:var(--fs-meta)] leading-snug text-[color:var(--ink)]">
                  {flight.groundSpeedMps != null
                    ? `${formatFixed(mpsToKnots(flight.groundSpeedMps), 0)} kt`
                    : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-[var(--r-ctl)] border border-[color:var(--hair-soft)] bg-[color:var(--ground)] px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">
                  Track
                </div>
                <div className="mt-0.5 truncate font-bold text-[length:var(--fs-meta)] leading-snug text-[color:var(--ink)]">
                  {flight.trackDeg != null
                    ? `${formatFixed(flight.trackDeg, 1)}°`
                    : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-[var(--r-ctl)] border border-[color:var(--hair-soft)] bg-[color:var(--ground)] px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">
                  Altitude
                </div>
                <div className="mt-0.5 break-words font-bold text-[length:var(--fs-meta)] leading-snug text-[color:var(--ink)]">
                  {altBlock(flight)}
                </div>
              </div>
              <div className="min-w-0 rounded-[var(--r-ctl)] border border-[color:var(--hair-soft)] bg-[color:var(--ground)] px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">
                  Contrails
                </div>
                <div
                  className={`mt-0.5 font-bold text-[length:var(--fs-meta)] leading-snug ${contrail != null ? CONTRAIL_COLOR[contrail] : "text-[color:var(--t-tertiary)]"}`}
                >
                  {contrail != null ? CONTRAIL_LABEL[contrail] : "—"}
                </div>
              </div>
              <div className="min-w-0 rounded-[var(--r-ctl)] border border-[color:var(--hair-soft)] bg-[color:var(--ground)] px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">
                  Position
                </div>
                <div className="mt-0.5 break-words font-bold text-[length:var(--fs-meta)] tabular-nums leading-snug text-[color:var(--ink-2)]">
                  {formatFixed(flight.position.lat, 3)}°,{" "}
                  {formatFixed(flight.position.lng, 3)}°
                </div>
              </div>
              <div className="min-w-0 rounded-[var(--r-ctl)] border border-[color:var(--hair-soft)] bg-[color:var(--ground)] px-2.5 py-1.5 md:px-3 md:py-2">
                <div className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">
                  Source
                </div>
                <div className="mt-0.5 truncate font-bold text-[length:var(--fs-meta)] leading-snug text-[color:var(--ink)]">
                  {flight.providerId ? providerLabel(flight.providerId) : "—"}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
