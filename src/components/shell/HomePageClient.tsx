"use client";

import { CompassAimPanel } from "@/components/field/CompassAimPanel";
import { FieldOverlaysSection } from "@/components/field/FieldOverlaysSection";
import { useActiveTransits } from "@/hooks/useActiveTransits";
import { useNearestTransitWindow } from "@/hooks/useNearestTransitWindow";
import {
  formatCountdown,
  usePhotographerTools,
  useTransitBeep,
} from "@/hooks/usePhotographerTools";
import { useTransitCandidates, useMoonStateComputed } from "@/hooks/useTransitCandidates";
import { getFlightProvider } from "@/lib/flight/flightProviderRegistry";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import {
  FLIGHT_PROVIDER_IDS,
  type FlightProviderId,
} from "@/types/flight-provider";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MapContainer = dynamic(
  () =>
    import("@/components/map/MapContainer").then((m) => m.MapContainer),
  { ssr: false, loading: () => <div className="h-full w-full bg-zinc-900" /> }
);

function mpsToKn(m: number): number {
  return m * 1.943_844_492;
}

function num(n: number, d = 2): string {
  return n.toFixed(d);
}

export function HomePageClient() {
  const flightProviderId = useMoonTransitStore((s) => s.flightProvider);
  const setFlightProvider = useMoonTransitStore((s) => s.setFlightProvider);
  const flightProvider = useMemo(
    () => getFlightProvider(flightProviderId),
    [flightProviderId]
  );

  const moon = useMoonStateComputed();
  const candidates = useTransitCandidates();
  const isLoading = useMoonTransitStore((s) => s.isLoading);
  const flights = useMoonTransitStore((s) => s.flights);
  const setSelectedFlightId = useMoonTransitStore(
    (s) => s.setSelectedFlightId
  );
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const { pack: photoPack } = usePhotographerTools();
  const [beepOnTransit, setBeepOnTransit] = useState(false);
  useTransitBeep(photoPack?.timeToAlignmentSec ?? null, beepOnTransit);
  const routeCorridor = useMemo(
    () => flightProvider.getRouteCorridorStats?.() ?? null,
    [flightProvider, flightProviderId, isLoading, flights]
  );
  const error = useMoonTransitStore((s) => s.error);
  const setTimeOffsetMs = useMoonTransitStore((s) => s.setTimeOffsetMs);
  const timeOffsetMs = useMoonTransitStore((s) => s.timeOffsetMs);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const syncTimeToNow = useMoonTransitStore((s) => s.syncTimeToNow);
  const activeTransits = useActiveTransits(0.5);
  const isGolden = useMemo(
    () => activeTransits.some((r) => r.deltaAzDeg < 0.1),
    [activeTransits]
  );
  const nearestWindow = useNearestTransitWindow();
  const [goldenFlashToken, setGoldenFlashToken] = useState<number | null>(null);
  const wasGoldenRef = useRef(false);
  useEffect(() => {
    if (isGolden && !wasGoldenRef.current) {
      setGoldenFlashToken(Date.now());
    }
    wasGoldenRef.current = isGolden;
  }, [isGolden]);
  const [ephemerisReady, setEphemerisReady] = useState(false);

  const obs = useObserverStore((s) => s.observer);
  const observerLocationLocked = useObserverStore(
    (s) => s.observerLocationLocked
  );
  const setObserver = useObserverStore((s) => s.setObserver);
  const requestFocusOnObserver = useObserverStore(
    (s) => s.requestFocusOnObserver
  );
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const onUseGps = useCallback(() => {
    if (observerLocationLocked) {
      setGpsError("Location is locked. Unlock in the Field section.");
      return;
    }
    if (!globalThis.isSecureContext) {
      setGpsError("GPS only works in a secure context (https).");
      return;
    }
    if (!("geolocation" in globalThis.navigator)) {
      setGpsError("Geolocation is not supported.");
      return;
    }
    setGpsBusy(true);
    setGpsError(null);
    globalThis.navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObserver({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          groundHeightMeters:
            pos.coords.altitude != null && !Number.isNaN(pos.coords.altitude)
              ? pos.coords.altitude
              : 0,
        });
        setGpsBusy(false);
      },
      (err) => {
        setGpsError(err.message);
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    );
  }, [setObserver, observerLocationLocked]);
  useEffect(() => {
    syncTimeToNow();
    setEphemerisReady(true);
  }, [syncTimeToNow]);

  const syncTime = useCallback(() => {
    syncTimeToNow();
  }, [syncTimeToNow]);

  const offsetHours = timeOffsetMs / 3_600_000;
  const onSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTimeOffsetMs(parseFloat(e.target.value) * 3_600_000);
    },
    [setTimeOffsetMs]
  );

  const showEphemeris = ephemerisReady;
  const moonDisplay = (v: string) => (showEphemeris ? v : "—");
  const candidatesDisplay = showEphemeris ? candidates : [];
  const showEmptyCandidates =
    showEphemeris && candidates.length === 0 && !isLoading;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col md:flex-row">
      {goldenFlashToken != null && (
        <div
          key={goldenFlashToken}
          className="golden-ui-flash-overlay"
          aria-hidden
          onAnimationEnd={() => {
            setGoldenFlashToken(null);
          }}
        />
      )}
      <aside className="w-full max-h-[40vh] shrink-0 overflow-y-auto border-b border-zinc-800 bg-zinc-950/95 p-4 text-zinc-200 md:max-h-none md:w-80 md:border-b-0 md:border-r">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Flight source
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
          OpenSky: real ADS-B where the viewport intersects{" "}
          <code className="font-mono text-zinc-500">routes.json</code> flight
          corridors and the map. Static: simulated points along routes.
        </p>
        <label className="mt-2 block text-xs text-zinc-500">
          Provider
          <select
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-sm text-zinc-200"
            value={flightProviderId}
            onChange={(e) =>
              setFlightProvider(e.target.value as FlightProviderId)
            }
          >
            {FLIGHT_PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {id === "mock"
                  ? "Mock"
                  : id === "static"
                    ? "Routes (static)"
                    : "OpenSky (ADS-B)"}
              </option>
            ))}
          </select>
        </label>
        {flightProviderId === "opensky" && (
          <div className="mt-2 rounded border border-sky-900/50 bg-sky-950/25 px-2 py-1.5 text-xs leading-relaxed text-sky-100/90">
            {routeCorridor && routeCorridor.sampleCount > 0 ? (
              <p>
                Average speed in the route region (map viewport; aircraft in
                the air with valid speed):{" "}
                <span className="font-mono tabular-nums">
                  {num(routeCorridor.avgSpeedMps, 1)} m/s
                </span>{" "}
                (≈ {num(mpsToKn(routeCorridor.avgSpeedMps), 0)} kn),{" "}
                <span className="font-mono tabular-nums">
                  {routeCorridor.sampleCount}
                </span>{" "}
                samples.
              </p>
            ) : isLoading ? (
              <p className="text-zinc-500">Fetching OpenSky…</p>
            ) : (
              <p className="text-zinc-500">
                No samples in the visible region, or the map does not intersect
                the route corridor.
              </p>
            )}
          </div>
        )}
        <h2 className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Observer
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
          Fixed point (does not follow pan) — all ephemeris and intersection
          math use this.
        </p>
        <dl className="mt-2 space-y-0.5 font-mono text-xs tabular-nums text-zinc-300">
          <div className="flex justify-between gap-2">
            <dt>φ</dt>
            <dd>{num(obs.lat, 5)}°</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>λ</dt>
            <dd>{num(obs.lng, 5)}°</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Ground alt. (ellipsoid)</dt>
            <dd>{num(obs.groundHeightMeters, 0)} m</dd>
          </div>
        </dl>
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={onUseGps}
            disabled={gpsBusy || observerLocationLocked}
            className="rounded border border-sky-800/50 bg-sky-950/30 px-2 py-1.5 text-sm text-sky-200/90 transition hover:border-sky-500/50 disabled:opacity-50"
          >
            {gpsBusy ? "GPS…" : "Use my GPS"}
          </button>
          {gpsError && (
            <p className="text-xs text-red-400/90">{gpsError}</p>
          )}
          <button
            type="button"
            onClick={() => {
              requestFocusOnObserver();
            }}
            className="rounded border border-zinc-600 bg-zinc-800/50 px-2 py-1.5 text-sm text-zinc-200 transition hover:border-amber-500/40 hover:text-white"
          >
            Focus on me
          </button>
        </div>
        <h2 className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Mjesec (nowcast)
        </h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Altitude</dt>
            <dd className="font-mono tabular-nums">
              {moonDisplay(num(moon.altitudeDeg))}°
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Azimut (N)</dt>
            <dd className="font-mono tabular-nums">
              {moonDisplay(num(moon.azimuthDeg))}°
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Angular radius</dt>
            <dd className="font-mono tabular-nums">
              {moonDisplay(num(moon.apparentRadius.degrees, 3))}°
            </dd>
          </div>
        </dl>
        <div className="mt-5 rounded border border-zinc-800/80 bg-zinc-900/30 p-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Time (±6 h)
          </h2>
          <p
            className="mt-1.5 text-center font-mono text-sm tabular-nums text-zinc-200"
            suppressHydrationWarning
          >
            {showEphemeris
              ? new Date(referenceEpochMs).toLocaleString("en-US", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "—"}
          </p>
          <div className="mt-2 flex items-center justify-between gap-1 text-xs text-zinc-500">
            <span>−6 h</span>
            <span>anchor</span>
            <span>+6 h</span>
          </div>
          <input
            type="range"
            min={-6}
            max={6}
            step={0.1}
            value={offsetHours}
            onChange={onSlider}
            disabled={!showEphemeris}
            className="mt-1 w-full accent-amber-400 disabled:opacity-40"
            aria-label="Time offset in hours from anchor"
          />
          <p className="mt-1.5 text-center text-xs text-zinc-500">
            Offset:{" "}
            <span className="font-mono text-amber-200/90">
              {offsetHours >= 0 ? "+" : ""}
              {offsetHours.toFixed(1)} h
            </span>
          </p>
          {showEphemeris && (
            <p
              className="mt-2 border-t border-zinc-800/80 pt-2 text-left text-[0.7rem] leading-relaxed text-zinc-500"
            >
              {nearestWindow.label}
            </p>
          )}
        </div>
        <h2 className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Transit candidates
        </h2>
        {showEphemeris && isLoading && (
          <p className="mt-2 text-sm text-zinc-500">Loading…</p>
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
          {showEmptyCandidates && (
            <li className="text-zinc-500">No visible tracks.</li>
          )}
          {candidatesDisplay.map((c) => (
            <li key={c.flight.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedFlightId(c.flight.id);
                }}
                className={`flex w-full justify-between gap-2 rounded border px-2 py-1 text-left transition ${
                  selectedFlightId === c.flight.id
                    ? "border-sky-400/60 bg-sky-950/40"
                    : "border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-600"
                }`}
              >
                <span className="truncate font-mono text-xs text-sky-300">
                  {c.flight.callSign ?? c.flight.id}
                </span>
                <span className="shrink-0 font-mono text-xs text-zinc-400">
                  {num(c.separationDeg, 3)}°
                  {c.isPossibleTransit ? " · ⊙" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <h2 className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Active transits
        </h2>
        <p className="mt-1 text-xs leading-snug text-zinc-500">
          Moon and aircraft azimuth (from altitude) within{" "}
          <span className="font-mono">0.5°</span> — on the “yellow ray.”
        </p>
        {showEphemeris && (
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-sm">
            {activeTransits.length === 0 && (
              <li className="text-zinc-500">Nobody on the ray.</li>
            )}
            {activeTransits.map((row) => (
              <li key={row.flight.id} className="list-none">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFlightId(row.flight.id);
                  }}
                  className={`w-full space-y-1.5 rounded border px-2 py-1.5 text-left transition ${
                    selectedFlightId === row.flight.id
                      ? "border-amber-300/50 bg-amber-950/35"
                      : "border-amber-900/40 bg-amber-950/20 hover:border-amber-700/50"
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-mono text-xs text-amber-200/90">
                      {row.flight.callSign ?? row.flight.id}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-amber-300/80">
                      Δ {num(row.deltaAzDeg, 2)}°
                    </span>
                  </div>
                  <p className="text-[0.7rem] leading-snug text-amber-100/75">
                    {row.nudgeLine}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-emerald-900/50 bg-zinc-900/50 p-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-emerald-500/80">
            Photographer — tools
          </h2>
          <p className="mt-1 text-[0.65rem] leading-relaxed text-zinc-500">
            Select an aircraft from the list (candidate or active). Moon: simulated
            time from the slider. Flight is extrapolated 30 s along track; OpenSky:
            real speed / track.
          </p>
          {selectedFlightId == null && (
            <p className="mt-2 text-sm text-zinc-500">No flight selected.</p>
          )}
          {selectedFlightId && !photoPack && (
            <p className="mt-2 text-sm text-amber-300/80">
              This aircraft is missing speed/track/altitude for the calculation.
            </p>
          )}
          {photoPack && (
            <div className="mt-3 space-y-3">
              <div
                className="rounded-lg border border-emerald-800/50 bg-zinc-950/80 py-3 text-center"
                aria-live="polite"
              >
                <p className="text-[0.6rem] uppercase tracking-wider text-zinc-500">
                  To moon ray (obs. azimuth, linear model)
                </p>
                <p className="mt-0.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-emerald-300">
                  {formatCountdown(photoPack.timeToAlignmentSec ?? null)}
                </p>
              </div>
              <dl className="min-w-0 space-y-0.5 break-words font-mono text-[0.7rem] tabular-nums text-zinc-400">
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <dt className="shrink-0">ω (aircraft azimuth, |·|)</dt>
                  <dd>
                    {num(photoPack.kin.absAzimuthRateDegPerSec, 3)}°/s
                  </dd>
                </div>
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
                  <dt className="shrink-0">Slant range</dt>
                  <dd>{num(photoPack.kin.slantRangeMeters / 1000, 2)} km</dd>
                </div>
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
                  <dt className="shrink-0">Transit duration (moon + wing)</dt>
                  <dd>
                    {photoPack.transitDurationMs != null
                      ? `${(photoPack.transitDurationMs / 1000).toFixed(2)} s`
                      : "—"}
                  </dd>
                </div>
                <div className="min-w-0 flex flex-col gap-0.5 pt-1 text-[0.65rem] text-zinc-500">
                  <dt className="text-zinc-500">Shutter (≈ blur &lt; 2% of span, 40 m)</dt>
                  <dd className="min-w-0 break-words text-pretty text-emerald-200/80">
                    {photoPack.shutterText ?? "—"}
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
                <span className="text-xs text-zinc-500">Sound on transit</span>
                <button
                  type="button"
                  onClick={() => {
                    setBeepOnTransit((b) => !b);
                  }}
                  className={`rounded px-2.5 py-1 text-xs ${
                    beepOnTransit
                      ? "bg-emerald-800/50 text-emerald-100"
                      : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {beepOnTransit ? "Beep on" : "Beep off"}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="mt-5 min-w-0 space-y-4">
          <CompassAimPanel />
          <FieldOverlaysSection photoShutter={photoPack?.shutterText ?? null} />
        </div>
        <button
          type="button"
          onClick={syncTime}
          className="mt-4 w-full rounded border border-zinc-700 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
        >
          Sync time
        </button>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600">
          Fixed observer: marker 📷. Map routes from{" "}
          <code className="mx-0.5 font-mono text-zinc-500">routes.json</code>{" "}
          (static, OpenSky). The provider chooses real vs. approximate flight
          positions.
        </p>
      </aside>
      <div className="relative min-h-0 min-w-0 flex-1">
        <MapContainer flightProvider={flightProvider} isGolden={isGolden} />
      </div>
    </div>
  );
}
