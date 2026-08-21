"use client";

import { appPath } from "@/lib/paths/appPath";
import { callsignToCarrier } from "@/lib/flight/icaoAirline";
import { callsignToKiwiIata } from "@/lib/flight/flightDisplayLabels";
import { fetchOpenSkyAircraftIndexEntry } from "@/lib/flight/openskyAircraftIndexClient";
import {
  formatOpenSkyAircraftIndexLabel,
  openSkyAircraftIndexRegistration,
} from "@/lib/flight/openskyAircraftIndexShard";
import type { AircraftListRow } from "@/lib/db/flightLogDb";
import { formatFixed } from "@/lib/format/numbers";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { PhotoSpotOpportunity, PhotoSpotsResponse } from "@/types/photoSpot";
import { useObserverStore } from "@/stores/observer-store";
import { useCallback, useEffect, useRef, useState } from "react";

/** Mirror of the transit-history API event shape. */
interface PastTransitEvent {
  icao24: string;
  callsign: string | null;
  timeMs: number;
  minSeparationDeg: number;
  kind: "transit" | "near";
  moonAltDeg: number;
  slantKm: number;
}

/** Mirror of the transit-calendar API entry shape. */
interface UpcomingOpportunity {
  callsign: string;
  estimateMs: number;
  stdMinutes: number;
  sessionCount: number;
  kind: "transit" | "near";
  minSeparationDeg: number;
  elevationGapDeg: number;
  inFrame: boolean;
  moonAltDeg: number;
}

/** Mirror of the transit-calendar API `closest` fallback shape — same as
 *  UpcomingOpportunity minus `kind` (these never cleared NEAR_TOL_DEG). */
type UpcomingClosest = Omit<UpcomingOpportunity, "kind">;

/**
 * Coverage slider bounds — a **floor**, never a ceiling.
 *
 * The band of interest starts at 25 %: below that the aircraft is a quarter of
 * the Moon's width, which in practice means cruise traffic 40 km away. There
 * is deliberately no upper filter — an aircraft wider than the disk (low
 * approach traffic routinely clears 150 %) is a wanted result, not an outlier,
 * so the slider's top only lets you ask for *those* and nothing smaller.
 */
const MIN_COVERAGE_SLIDER_MIN = 25;
const MIN_COVERAGE_SLIDER_MAX = 150;
const DEFAULT_MIN_COVERAGE_PERCENT = 25;
const DEFAULT_MAX_SPOT_KM = 25;
const SPOT_DISTANCE_OPTS = [5, 15, 25, 50] as const;

const LOW_CONFIDENCE_STD_MINUTES = 15;
const LOW_CONFIDENCE_SESSION_COUNT = 5;

/** Same Δalt formatting + color thresholds as the live Photographer/Candidates
 *  tool's ElevationGapBadge (TransitCandidatesPanel.tsx) — reused here so the
 *  forecast speaks the same visual language as the live "in frame" check. */
function ElevationGapLabel({ gap }: { gap: number }) {
  const abs = Math.abs(gap);
  const sign = gap >= 0 ? "+" : "−";
  const label = `Δalt ${sign}${formatFixed(abs, 2)}°`;
  const color = abs <= 0.26 ? "text-emerald-400" : abs <= 1.5 ? "text-amber-400" : "text-[color:var(--t-tertiary)]";
  return <span className={`font-mono text-[length:var(--fs-meta)] font-medium ${color}`}>{label}</span>;
}

const PAGE_SIZE = 50;

const RANGE_OPTS = [
  { label: "24 h", days: 1 },
  { label: "7 d", days: 7 },
  { label: "30 d", days: 30 },
] as const;

/** Matches a search string against an AircraftListRow (client-side, case-insensitive). */
function rowMatchesSearch(row: AircraftListRow, term: string, typeOverride?: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  if (row.icao24.toLowerCase().includes(t)) return true;
  if (row.last_callsign?.toLowerCase().includes(t)) return true;
  if (row.registration?.toLowerCase().includes(t)) return true;
  if (row.aircraft_type?.toLowerCase().includes(t)) return true;
  if (typeOverride?.toLowerCase().includes(t)) return true;
  const carrier = callsignToCarrier(row.last_callsign);
  if (carrier.toLowerCase().includes(t)) return true;
  return false;
}

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 8-point compass label for a true bearing — "2.4 km SE" reads faster than "134°". */
function compassPoint(bearingDeg: number): string {
  return COMPASS_POINTS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8]!;
}

function fmtDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** "today 14:23", "tomorrow 09:41", or "Fri 14:23" in the viewer's locale/timezone. */
function fmtNextPass(estimateMs: number): string {
  const d = new Date(estimateMs);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `today ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

export function FlightLogPanel() {
  const setFlightLogSelected = useMoonTransitStore((s) => s.setFlightLogSelected);
  const setFlightLogSelectedCallsign = useMoonTransitStore((s) => s.setFlightLogSelectedCallsign);
  const setFlightLogDaysBack = useMoonTransitStore((s) => s.setFlightLogDaysBack);
  const flightLogIcao24 = useMoonTransitStore((s) => s.flightLogSelectedIcao24);
  const flightLogCallsign = useMoonTransitStore((s) => s.flightLogSelectedCallsign);
  const nextPass = useMoonTransitStore((s) => s.flightLogNextPass);
  const altitudeProfile = useMoonTransitStore((s) => s.flightLogAltitude);
  const cameraFocalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const cameraSensorType = useMoonTransitStore((s) => s.cameraSensorType);
  const observer = useObserverStore((s) => s.observer);

  const [daysBack, setDaysBack] = useState(7);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  /** null = loading / first fetch; array = data ready */
  const [allRows, setAllRows] = useState<AircraftListRow[] | null>(null);
  /**
   * Aircraft type labels fetched from the OpenSky shard index for rows where
   * the local DB has no aircraft_type (readsb didn't have it in its DB).
   * Keyed by icao24 lowercase.
   */
  const [typeOverrides, setTypeOverrides] = useState<Map<string, string>>(new Map());
  /** Registracije iz OpenSky indeksa za retke gdje ih DB nema (Pi feed nema reg). Keyed icao24 lower. */
  const [regOverrides, setRegOverrides] = useState<Map<string, string>>(new Map());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [scanBusy, setScanBusy] = useState(false);
  const [scanEvents, setScanEvents] = useState<PastTransitEvent[] | null>(null);
  const [scanError, setScanError] = useState(false);

  const runPastScan = useCallback(() => {
    setScanBusy(true);
    setScanError(false);
    const params = new URLSearchParams({
      days: String(daysBack),
      lat: String(observer.lat),
      lng: String(observer.lng),
      heightM: String(observer.groundHeightMeters ?? 0),
    });
    fetch(appPath(`/api/flight-log/transit-history?${params}`), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events: PastTransitEvent[] }) => setScanEvents(d.events ?? []))
      .catch(() => setScanError(true))
      .finally(() => setScanBusy(false));
  }, [daysBack, observer]);

  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarEntries, setCalendarEntries] = useState<UpcomingOpportunity[] | null>(null);
  const [calendarClosest, setCalendarClosest] = useState<UpcomingClosest[]>([]);
  const [calendarError, setCalendarError] = useState(false);
  /** True once the user has run the scan at least once — gates the
   *  location-change auto-rescan below so it doesn't fire on mount. */
  const calendarScannedRef = useRef(false);

  const runCalendarScan = useCallback(() => {
    calendarScannedRef.current = true;
    setCalendarBusy(true);
    setCalendarError(false);
    const params = new URLSearchParams({
      lat: String(observer.lat),
      lng: String(observer.lng),
      heightM: String(observer.groundHeightMeters ?? 0),
      focalLengthMm: String(cameraFocalLengthMm),
      sensorType: cameraSensorType,
    });
    fetch(appPath(`/api/flight-log/transit-calendar?${params}`), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { entries: UpcomingOpportunity[]; closest: UpcomingClosest[] }) => {
        setCalendarEntries(d.entries ?? []);
        setCalendarClosest(d.closest ?? []);
      })
      .catch(() => setCalendarError(true))
      .finally(() => setCalendarBusy(false));
  }, [observer, cameraFocalLengthMm, cameraSensorType]);

  // Re-run the calendar scan automatically when the observer's location
  // changes, but only after the user has scanned at least once — otherwise
  // this would fire an unwanted request the moment the panel mounts.
  useEffect(() => {
    if (calendarScannedRef.current) {
      runCalendarScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observer.lat, observer.lng, observer.groundHeightMeters]);

  // --- "Where to stand" spot forecast -------------------------------------
  const setPhotoSpotSelected = useMoonTransitStore((s) => s.setPhotoSpotSelected);
  const selectedSpot = useMoonTransitStore((s) => s.photoSpotSelected);
  const [spotBusy, setSpotBusy] = useState(false);
  const [spotData, setSpotData] = useState<PhotoSpotsResponse | null>(null);
  const [spotError, setSpotError] = useState(false);
  const [minCoverage, setMinCoverage] = useState(DEFAULT_MIN_COVERAGE_PERCENT);
  const [maxSpotKm, setMaxSpotKm] = useState(DEFAULT_MAX_SPOT_KM);

  const runSpotScan = useCallback(() => {
    setSpotBusy(true);
    setSpotError(false);
    const params = new URLSearchParams({
      lat: String(observer.lat),
      lng: String(observer.lng),
      heightM: String(observer.groundHeightMeters ?? 0),
      maxSpotKm: String(maxSpotKm),
      minCoveragePercent: String(minCoverage),
    });
    fetch(appPath(`/api/flight-log/photo-spots?${params}`), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: PhotoSpotsResponse) => setSpotData(d))
      .catch(() => setSpotError(true))
      .finally(() => setSpotBusy(false));
  }, [observer, maxSpotKm, minCoverage]);

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(0);
    }, 350);
  }, []);

  const handleRangeChange = useCallback((days: number) => {
    setDaysBack(days);
    setPage(0);
    // Keep the map layers' lookback in sync so an already-selected route refetches.
    setFlightLogDaysBack(days);
  }, [setFlightLogDaysBack]);

  // Fetch all rows for the selected time range (no server-side search so we can
  // filter by carrier name on the client).
  useEffect(() => {
    const params = new URLSearchParams({
      days: String(daysBack),
      // Dohvati cijeli prozor (ruta caps na 5000) pa filtriraj/pagina lokalno.
      limit: "5000",
      offset: "0",
    });
    let cancelled = false;
    fetch(appPath(`/api/flight-log/aircraft-list?${params}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setAllRows(d && typeof d.total === "number" ? (d.rows ?? []) : []);
      })
      .catch(() => { if (!cancelled) setAllRows([]); });
    return () => { cancelled = true; };
  }, [daysBack]);

  // Enrich missing aircraft_type AND registration from the OpenSky shard index
  // (same source as the airplane popup; the Pi feed has neither in aircraft.json).
  // Runs whenever allRows changes; shards are cached in-memory so aircraft already
  // looked up resolve instantly.
  useEffect(() => {
    if (!allRows || allRows.length === 0) return;
    const toEnrich = allRows.filter((r) => !r.aircraft_type || !r.registration);
    if (toEnrich.length === 0) return;
    let cancelled = false;
    Promise.allSettled(
      toEnrich.map(async (row) => {
        const entry = await fetchOpenSkyAircraftIndexEntry(row.icao24);
        return {
          icao24: row.icao24.toLowerCase(),
          label: entry ? formatOpenSkyAircraftIndexLabel(entry).trim() : "",
          reg: entry ? openSkyAircraftIndexRegistration(entry) : "",
        };
      })
    ).then((results) => {
      if (cancelled) return;
      const types = new Map<string, string>();
      const regs = new Map<string, string>();
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        if (r.value.label) types.set(r.value.icao24, r.value.label);
        if (r.value.reg) regs.set(r.value.icao24, r.value.reg);
      }
      if (types.size > 0) setTypeOverrides(types);
      if (regs.size > 0) setRegOverrides(regs);
    }).catch(() => {/* ignore */});
    return () => { cancelled = true; };
  }, [allRows]);

  // Client-side search filter + pagination
  const filteredRows = allRows === null
    ? null
    : allRows.filter((r) =>
        rowMatchesSearch(r, debouncedSearch, typeOverrides.get(r.icao24.toLowerCase()))
      );
  const totalFiltered = filteredRows?.length ?? 0;

  // Top aircraft types in the current range — distinct aircraft per type label
  // (same label source as the table's Type column).
  const topTypes = (() => {
    if (!allRows) return [];
    const counts = new Map<string, number>();
    for (const r of allRows) {
      const t = r.aircraft_type ?? typeOverrides.get(r.icao24.toLowerCase());
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  })();
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const pageRows = filteredRows?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? null;

  // Direct page-number entry — uncontrolled input (keyed on `page` so it resets
  // when the page changes elsewhere); commits a clamped value on Enter/blur.
  const commitPageInput = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    const clamped = Number.isFinite(n)
      ? Math.min(Math.max(1, n), Math.max(1, totalPages))
      : page + 1;
    setPage(clamped - 1);
    return clamped;
  }, [totalPages, page]);

  return (
    // h-full: fill the shell's scroll area exactly so the outer scroller stays
    // still and only the table list (flex-1 below) scrolls.
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Selection hint */}
      {(flightLogCallsign || flightLogIcao24) && (
        <div className="rounded-xl border border-sky-400/25 bg-sky-500/[0.07] px-3 py-2 text-[length:var(--fs-label)]">
          <div className="flex items-center justify-between">
          <span className="text-sky-300">
            {flightLogCallsign
              ? <>Route history on map: <span className="font-mono">{flightLogCallsign}</span></>
              : <>Track on map: <span className="font-mono">{flightLogIcao24}</span></>}
          </span>
          <button
            type="button"
            onClick={() => {
              setFlightLogSelectedCallsign(null);
              setFlightLogSelected(null);
            }}
            className="text-[color:var(--t-tertiary)] hover:text-[color:var(--t-primary)] transition"
            aria-label="Clear selection"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          </div>
          {nextPass && nextPass.callsign === flightLogCallsign && (
            <div className="mt-1 text-[color:var(--t-secondary)]">
              Next expected pass:{" "}
              <span className="font-semibold text-sky-200">{fmtNextPass(nextPass.estimateMs)}</span>
              {" "}±{nextPass.stdMinutes} min
              <span className="text-[color:var(--t-tertiary)]"> · {nextPass.sessionCount} flights</span>
            </div>
          )}
          {altitudeProfile && altitudeProfile.callsign === flightLogCallsign && (
            <div className="mt-0.5 text-[color:var(--t-tertiary)]">
              Alt over area:{" "}
              <span className="tabular-nums text-[color:var(--t-secondary)]">
                {(altitudeProfile.minM / 1000).toFixed(1)}–{(altitudeProfile.maxM / 1000).toFixed(1)} km
              </span>
              {" "}(median {(altitudeProfile.medianM / 1000).toFixed(1)} km)
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Range pills */}
        <div className="flex gap-1">
          {RANGE_OPTS.map(({ label, days }) => (
            <button
              key={days}
              type="button"
              onClick={() => handleRangeChange(days)}
              className={`rounded-full px-3 py-1 text-[length:var(--fs-label)] font-semibold transition ${
                daysBack === days
                  ? "bg-violet-500/25 text-violet-200 border border-violet-400/40"
                  : "border border-white/10 text-[color:var(--t-tertiary)] hover:border-white/20 hover:text-[color:var(--t-primary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search with clear button */}
        <div className="relative flex-1 min-w-[140px]">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[color:var(--t-tertiary)] pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="ICAO, callsign, reg, carrier…"
            className="w-full rounded-full border border-white/10 bg-white/[0.04] pl-8 pr-8 py-1.5 text-[length:var(--fs-meta)] text-[color:var(--t-primary)] outline-none placeholder:text-[color:var(--t-tertiary)] focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/20"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                handleSearchChange("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[color:var(--t-tertiary)] hover:text-[color:var(--t-primary)] transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <p className="text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
        {allRows === null
          ? "Loading…"
          : search
          ? `${totalFiltered} of ${allRows.length} aircraft`
          : `${allRows.length} aircraft`}
      </p>

      {/* Top aircraft types — click filters the table (toggles) */}
      {topTypes.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {topTypes.map(([type, count]) => {
            const active = search === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleSearchChange(active ? "" : type)}
                aria-pressed={active}
                className={`rounded-full border px-2 py-0.5 text-[length:var(--fs-meta)] transition ${
                  active
                    ? "border-violet-400/40 bg-violet-500/20 text-violet-200"
                    : "border-white/10 text-[color:var(--t-tertiary)] hover:border-white/20 hover:text-[color:var(--t-primary)]"
                }`}
                title={`Filter table to ${type}`}
              >
                {type} <span className="tabular-nums opacity-70">×{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Table — the only scrollable region of the panel */}
      <div className="min-h-[10rem] flex-1 overflow-x-auto overflow-y-auto rounded-xl border border-white/[0.08]">
        <table className="w-full text-[length:var(--fs-meta)]">
          <thead className="sticky top-0 z-10 bg-[color:var(--bg-1)]">
            <tr className="border-b border-white/[0.08] mt-section-label">
              <th className="px-3 py-2 text-left w-10"></th>
              <th className="px-3 py-2 text-left">Carrier</th>
              <th className="px-3 py-2 text-left">Callsign</th>
              <th className="px-3 py-2 text-left">Reg</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Origin</th>
              <th className="px-3 py-2 text-left">Dest</th>
              <th className="px-3 py-2 text-left">Source</th>
            </tr>
          </thead>
          <tbody>
            {pageRows === null ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[color:var(--t-tertiary)]">Loading…</td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[color:var(--t-tertiary)]">No data</td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <AircraftRow
                  key={row.icao24}
                  row={row}
                  typeOverride={typeOverrides.get(row.icao24.toLowerCase())}
                  regOverride={regOverrides.get(row.icao24.toLowerCase())}
                  selectedCallsign={flightLogCallsign}
                  selectedIcao24={flightLogIcao24}
                  daysBack={daysBack}
                  onSelectCallsign={setFlightLogSelectedCallsign}
                  onSelectIcao24={setFlightLogSelected}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-[length:var(--fs-label)]">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-full border border-white/10 px-3 py-1 text-[color:var(--t-secondary)] disabled:opacity-30 hover:border-white/20 hover:text-[color:var(--t-primary)] transition"
          >
            ← Prev
          </button>
          <span className="flex items-center gap-1 text-[color:var(--t-tertiary)]">
            <input
              key={page}
              type="text"
              inputMode="numeric"
              aria-label="Go to page"
              defaultValue={page + 1}
              onChange={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9]/g, ""); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              onBlur={(e) => { e.currentTarget.value = String(commitPageInput(e.currentTarget.value)); }}
              onFocus={(e) => e.currentTarget.select()}
              className="w-10 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-center text-[color:var(--t-primary)] outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/20"
            />
            / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-full border border-white/10 px-3 py-1 text-[color:var(--t-secondary)] disabled:opacity-30 hover:border-white/20 hover:text-[color:var(--t-primary)] transition"
          >
            Next →
          </button>
        </div>
      )}

      {/* Past transits — retroactive scan of the log against the Moon's position */}
      <div className="flex flex-col gap-2 border-t border-white/[0.08] pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.14em] text-[color:var(--t-tertiary)]">
            Past transits
          </span>
          <button
            type="button"
            onClick={runPastScan}
            disabled={scanBusy}
            className="rounded-full border border-white/10 px-3 py-1 text-[length:var(--fs-label)] text-[color:var(--t-secondary)] disabled:opacity-40 hover:border-white/20 hover:text-[color:var(--t-primary)] transition"
          >
            {scanBusy ? "Scanning…" : `Scan last ${daysBack === 1 ? "24 h" : `${daysBack} d`}`}
          </button>
        </div>

        {scanError && (
          <p className="text-[length:var(--fs-label)] text-rose-300">Scan failed — try again.</p>
        )}

        {scanEvents !== null && !scanError && (
          scanEvents.length === 0 ? (
            <p className="text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
              No moon passes found in this period.
            </p>
          ) : (
            <ul className="flex max-h-48 flex-col divide-y divide-white/[0.05] overflow-y-auto">
              {scanEvents.map((ev) => (
                <li key={`${ev.icao24}-${ev.timeMs}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (ev.callsign) {
                        setFlightLogSelectedCallsign(ev.callsign, daysBack);
                        setFlightLogSelected(null);
                      } else {
                        setFlightLogSelected(ev.icao24, daysBack);
                        setFlightLogSelectedCallsign(null);
                      }
                    }}
                    className="flex w-full items-center gap-2 py-1.5 text-left text-[length:var(--fs-label)] hover:bg-white/[0.04] transition rounded-md px-1.5"
                    title="Show route on map"
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-meta)] font-semibold ${
                        ev.kind === "transit"
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30"
                          : "bg-sky-500/10 text-sky-300 border border-sky-400/25"
                      }`}
                    >
                      {ev.kind === "transit" ? "DISC" : "NEAR"}
                    </span>
                    <span className="font-mono text-[color:var(--t-primary)]">
                      {ev.callsign ?? ev.icao24.toUpperCase()}
                    </span>
                    <span className="ml-auto text-right text-[color:var(--t-tertiary)]">
                      {new Date(ev.timeMs).toLocaleString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                      <span className="ml-2 tabular-nums">{ev.minSeparationDeg.toFixed(2)}°</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {/* Upcoming opportunities — forward forecast from historical schedule regularity */}
      <div className="flex flex-col gap-2 border-t border-white/[0.08] pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.14em] text-[color:var(--t-tertiary)]">
            Upcoming opportunities
          </span>
          <button
            type="button"
            onClick={runCalendarScan}
            disabled={calendarBusy}
            className="rounded-full border border-white/10 px-3 py-1 text-[length:var(--fs-label)] text-[color:var(--t-secondary)] disabled:opacity-40 hover:border-white/20 hover:text-[color:var(--t-primary)] transition"
          >
            {calendarBusy ? "Scanning…" : "Scan next 14 d"}
          </button>
        </div>

        <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
          Statistical forecast from past regularity — not a live prediction. Confirm with the live pipeline on the day.
        </p>

        {calendarError && (
          <p className="text-[length:var(--fs-label)] text-rose-300">Scan failed — try again.</p>
        )}

        {calendarEntries !== null && !calendarError && (
          calendarEntries.length > 0 ? (
            <ul className="flex max-h-48 flex-col divide-y divide-white/[0.05] overflow-y-auto">
              {calendarEntries.map((ev) => {
                const lowConfidence =
                  ev.stdMinutes > LOW_CONFIDENCE_STD_MINUTES ||
                  ev.sessionCount < LOW_CONFIDENCE_SESSION_COUNT;
                return (
                  <li key={`${ev.callsign}-${ev.estimateMs}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setFlightLogSelectedCallsign(ev.callsign, daysBack);
                        setFlightLogSelected(null);
                      }}
                      className="flex w-full items-center gap-2 py-1.5 text-left text-[length:var(--fs-label)] hover:bg-white/[0.04] transition rounded-md px-1.5"
                      title="Show route on map"
                    >
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-meta)] font-semibold ${
                          ev.kind === "transit"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30"
                            : "bg-sky-500/10 text-sky-300 border border-sky-400/25"
                        }`}
                      >
                        {ev.kind === "transit" ? "DISC" : "NEAR"}
                      </span>
                      <span className="font-mono text-[color:var(--t-primary)]">{ev.callsign}</span>
                      {lowConfidence && (
                        <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[length:var(--fs-meta)] font-semibold text-amber-300/90">
                          LOW CONF
                        </span>
                      )}
                      <span className="ml-auto text-right text-[color:var(--t-tertiary)]">
                        {fmtNextPass(ev.estimateMs)}
                        <span className="ml-2 tabular-nums">±{ev.stdMinutes}m</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : calendarClosest.length > 0 ? (
            <>
              <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
                No disk transit — closest predicted passes for your current camera:
              </p>
              <ul className="flex max-h-48 flex-col divide-y divide-white/[0.05] overflow-y-auto">
                {calendarClosest.map((ev) => (
                  <li key={`${ev.callsign}-${ev.estimateMs}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setFlightLogSelectedCallsign(ev.callsign, daysBack);
                        setFlightLogSelected(null);
                      }}
                      className="flex w-full items-center gap-2 py-1.5 text-left text-[length:var(--fs-label)] hover:bg-white/[0.04] transition rounded-md px-1.5"
                      title="Show route on map"
                    >
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-meta)] font-semibold ${
                          ev.inFrame
                            ? "bg-violet-500/15 text-violet-300 border border-violet-400/30"
                            : "bg-white/[0.05] text-[color:var(--t-tertiary)] border border-white/10"
                        }`}
                      >
                        {ev.inFrame ? "IN FRAME" : "OUT OF FRAME"}
                      </span>
                      <span className="font-mono text-[color:var(--t-primary)]">{ev.callsign}</span>
                      <span className="ml-auto flex items-center gap-2 text-right text-[color:var(--t-tertiary)]">
                        {fmtNextPass(ev.estimateMs)}
                        <ElevationGapLabel gap={ev.elevationGapDeg} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
              No regular flights with a predicted moon pass in this period.
            </p>
          )
        )}
      </div>

      {/* Where to stand — solves the ground point instead of fixing the observer */}
      <div className="flex flex-col gap-2 border-t border-white/[0.08] pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.14em] text-[color:var(--t-tertiary)]">
            Where to stand
          </span>
          <button
            type="button"
            onClick={runSpotScan}
            disabled={spotBusy}
            className="rounded-full border border-white/10 px-3 py-1 text-[length:var(--fs-label)] text-[color:var(--t-secondary)] disabled:opacity-40 hover:border-white/20 hover:text-[color:var(--t-primary)] transition"
          >
            {spotBusy ? "Solving…" : "Find spots"}
          </button>
        </div>

        <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
          Solves the ground point that puts a scheduled flight on the Moon&rsquo;s disk. The spot
          sweeps the ground at the aircraft&rsquo;s own speed — the dashed track on the map is where
          it travels during the pass.
        </p>

        <label className="flex items-center gap-2">
          <span className="shrink-0 text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
            Min coverage
          </span>
          <input
            type="range"
            min={MIN_COVERAGE_SLIDER_MIN}
            max={MIN_COVERAGE_SLIDER_MAX}
            step={1}
            value={minCoverage}
            onChange={(e) => setMinCoverage(parseInt(e.target.value, 10))}
            className="h-1.5 w-full min-w-0 flex-1 accent-sky-500"
            aria-label="Minimum aircraft coverage of the Moon, percent"
          />
          <span className="w-10 shrink-0 text-right font-mono text-[length:var(--fs-meta)] tabular-nums text-[color:var(--t-secondary)]">
            {minCoverage}%
          </span>
        </label>

        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
            Within
          </span>
          {SPOT_DISTANCE_OPTS.map((km) => (
            <button
              key={km}
              type="button"
              onClick={() => setMaxSpotKm(km)}
              className={`rounded-full border px-2.5 py-0.5 text-[length:var(--fs-meta)] transition ${
                maxSpotKm === km
                  ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                  : "border-white/10 text-[color:var(--t-tertiary)] hover:border-white/20"
              }`}
            >
              {km} km
            </button>
          ))}
        </div>

        {spotError && (
          <p className="text-[length:var(--fs-label)] text-rose-300">Scan failed — try again.</p>
        )}

        {spotData && !spotError && (
          spotData.spots.length > 0 ? (
            <ul className="flex max-h-56 flex-col divide-y divide-white/[0.05] overflow-y-auto">
              {spotData.spots.map((spot) => (
                <PhotoSpotRow
                  key={`${spot.callsign}-${spot.atMs}`}
                  spot={spot}
                  selected={
                    selectedSpot?.callsign === spot.callsign && selectedSpot?.atMs === spot.atMs
                  }
                  onSelect={setPhotoSpotSelected}
                />
              ))}
            </ul>
          ) : (
            <>
              <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
                Nothing reaches {minCoverage}% within {maxSpotKm} km. Best any scheduled pass can
                reach from anywhere: <span className="font-mono tabular-nums">{spotData.bestCoveragePercent}%</span>
                {" "}— coverage is capped by altitude, so a jet at cruise cannot fill half a Moon.
              </p>
              {spotData.closest.length > 0 && (
                <ul className="flex max-h-56 flex-col divide-y divide-white/[0.05] overflow-y-auto">
                  {spotData.closest.map((spot) => (
                    <PhotoSpotRow
                      key={`${spot.callsign}-${spot.atMs}`}
                      spot={spot}
                      selected={
                        selectedSpot?.callsign === spot.callsign &&
                        selectedSpot?.atMs === spot.atMs
                      }
                      onSelect={setPhotoSpotSelected}
                    />
                  ))}
                </ul>
              )}
            </>
          )
        )}
      </div>

    </div>
  );
}

/**
 * One "stand here" opportunity. The second line carries the numbers that decide
 * whether it is worth the drive: how far, how tight the standing tolerance is,
 * and how much the flight's own track wanders between passes — when the spread
 * dwarfs the tolerance, the spot is a neighbourhood, not a parking space.
 */
function PhotoSpotRow({
  spot,
  selected,
  onSelect,
}: {
  spot: PhotoSpotOpportunity;
  selected: boolean;
  onSelect: (spot: PhotoSpotOpportunity | null) => void;
}) {
  // Bigger is better here, so the palette runs the same way: emerald once the
  // silhouette covers half the disk (including the >100 % cases where it covers
  // all of it), amber for the thin end of the band, neutral below it — only
  // reachable via the `closest` near-miss list, which ignores the threshold.
  const coverageTone =
    spot.coveragePercent >= 50
      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
      : spot.coveragePercent >= 25
        ? "border-amber-400/25 bg-amber-500/10 text-amber-300"
        : "border-white/10 bg-white/[0.05] text-[color:var(--t-tertiary)]";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(selected ? null : spot)}
        className={`flex w-full flex-col gap-0.5 rounded-md px-1.5 py-1.5 text-left transition ${
          selected ? "bg-sky-500/15" : "hover:bg-white/[0.04]"
        }`}
        title="Show the spot and its shadow track on the map"
      >
        <span className="flex w-full items-center gap-2 text-[length:var(--fs-label)]">
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[length:var(--fs-meta)] font-semibold tabular-nums ${coverageTone}`}
          >
            {Math.round(spot.coveragePercent)}%
          </span>
          <span
            className={`font-mono ${selected ? "text-sky-200" : "text-[color:var(--t-primary)]"}`}
          >
            {spot.callsign}
          </span>
          {spot.confidence !== "high" && (
            <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[length:var(--fs-meta)] font-semibold text-amber-300/90">
              {spot.confidence === "low" ? "LOW CONF" : "MED CONF"}
            </span>
          )}
          <span className="ml-auto shrink-0 text-right text-[color:var(--t-tertiary)]">
            {fmtNextPass(spot.atMs)}
            <span className="ml-2 tabular-nums">±{spot.stdMinutes} min</span>
          </span>
        </span>
        <span className="flex w-full items-center gap-2 text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
          <span className="tabular-nums">
            {fmtDistance(spot.distanceFromObserverM)} {compassPoint(spot.bearingFromObserverDeg)}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">±{spot.crossTrackToleranceM} m across</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">track spread {fmtDistance(spot.trackSpreadM)}</span>
        </span>
      </button>
    </li>
  );
}

function AirlineLogo({ callsign }: { callsign: string | null | undefined }) {
  const [broken, setBroken] = useState(false);
  const iata = callsignToKiwiIata(callsign);
  const src = iata
    ? `https://images.kiwi.com/airlines/64x64/${iata.toUpperCase()}.png`
    : null;

  if (!src || broken) {
    return (
      <div
        className="h-7 w-7 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.03]"
        aria-hidden
      />
    );
  }
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.10] bg-white/[0.04]"
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={28}
        height={28}
        className="max-h-[calc(100%-2px)] max-w-[calc(100%-2px)] object-contain"
        decoding="async"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

function AircraftRow({
  row,
  typeOverride,
  regOverride,
  selectedCallsign,
  selectedIcao24,
  daysBack,
  onSelectCallsign,
  onSelectIcao24,
}: {
  row: AircraftListRow;
  /** Aircraft type from the OpenSky shard index (when DB has no aircraft_type). */
  typeOverride?: string;
  /** Registration from the OpenSky shard index (when DB has no registration). */
  regOverride?: string;
  selectedCallsign: string | null;
  selectedIcao24: string | null;
  daysBack: number;
  onSelectCallsign: (callsign: string | null, days?: number) => void;
  onSelectIcao24: (icao24: string | null, days?: number) => void;
}) {
  const carrier = callsignToCarrier(row.last_callsign);
  const isSelected = row.last_callsign
    ? selectedCallsign === row.last_callsign
    : selectedIcao24 === row.icao24;

  const handleClick = useCallback(() => {
    if (row.last_callsign) {
      // Commercial flight: show full session history + mean path for this callsign
      const next = selectedCallsign === row.last_callsign ? null : row.last_callsign;
      onSelectCallsign(next, daysBack);
      onSelectIcao24(null); // clear any ICAO24 trail
    } else {
      // No callsign: fall back to ICAO24 single-aircraft trail
      const next = selectedIcao24 === row.icao24 ? null : row.icao24;
      onSelectIcao24(next, daysBack);
      onSelectCallsign(null);
    }
  }, [row, selectedCallsign, selectedIcao24, daysBack, onSelectCallsign, onSelectIcao24]);

  return (
    <tr
      onClick={handleClick}
      className={`cursor-pointer border-b border-white/[0.05] transition ${
        isSelected
          ? "bg-sky-500/[0.10] hover:bg-sky-500/[0.16]"
          : "hover:bg-white/[0.04]"
      }`}
    >
      <td className="px-3 py-1.5">
        <AirlineLogo callsign={row.last_callsign} />
      </td>
      <td className="px-3 py-1.5 text-[color:var(--t-secondary)] max-w-[120px] truncate" title={carrier || undefined}>
        {carrier || <span className="text-[color:var(--t-disabled)]">—</span>}
      </td>
      <td className="px-3 py-1.5 font-mono text-[color:var(--t-primary)]">
        {row.last_callsign ?? <span className="text-[color:var(--t-disabled)]">—</span>}
      </td>
      <td className="px-3 py-1.5 text-[color:var(--t-tertiary)]">
        {(row.registration ?? regOverride) ?? <span className="text-[color:var(--t-disabled)]">—</span>}
      </td>
      <td className="px-3 py-1.5 text-[color:var(--t-tertiary)]">
        {(row.aircraft_type ?? typeOverride) ?? <span className="text-[color:var(--t-disabled)]">—</span>}
      </td>
      <td className="px-3 py-1.5 max-w-[100px] truncate text-[color:var(--t-tertiary)]" title={row.origin ?? undefined}>
        {row.origin ?? <span className="text-[color:var(--t-disabled)]">—</span>}
      </td>
      <td className="px-3 py-1.5 max-w-[100px] truncate text-[color:var(--t-tertiary)]" title={row.destination ?? undefined}>
        {row.destination ?? <span className="text-[color:var(--t-disabled)]">—</span>}
      </td>
      <td className="px-3 py-1.5 text-[color:var(--t-tertiary)]">
        {sourceLabel(row.source) ?? <span className="text-[color:var(--t-disabled)]">—</span>}
      </td>
    </tr>
  );
}

/** Prikazni naziv za `aircraft.source` — koji je lokalni prijemnik zadnji upisao ovaj zapis. */
function sourceLabel(source: string | null): string | null {
  if (source === "localsdr") return "LunaPic ADS-B";
  if (source === "avionix") return "Avionix Nano";
  return source;
}
