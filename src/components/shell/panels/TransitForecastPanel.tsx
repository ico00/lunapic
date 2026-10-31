"use client";

import { appPath } from "@/lib/paths/appPath";
import { formatFixed } from "@/lib/format/numbers";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { PhotoSpotOpportunity, PhotoSpotsResponse } from "@/types/photoSpot";
import { useObserverStore } from "@/stores/observer-store";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Prognoza tranzita (grupa Plan): najbolji termini za gledanje iz gustoće prometa
 * po nebu ("Best times to watch") i obrnuti problem — gdje stati da redoviti let
 * prođe preko diska ("Where to stand"). Do 2026-10-29 je bilo dio FlightLogPanela;
 * podaci dolaze iz loga, ali pitanje je planersko. Ne ovisi o odabiru u tablici
 * loga, samo o promatraču.
 */

type WatchWindow = {
  startMs: number;
  endMs: number;
  rating: "best" | "good";
  expectedTransits: number;
  moonAltDeg: number;
  moonAzDeg: number;
};

type WatchSummary = { usableHours: number; expectedTransits: number };

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

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 8-point compass label for a true bearing — "2.4 km SE" reads faster than "134°". */
function compassPoint(bearingDeg: number): string {
  return COMPASS_POINTS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8]!;
}

function fmtDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** "today", "tomorrow" or "Fri 6 Nov" in the viewer's locale/timezone. */
function fmtDay(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "today";
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return "tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** The date matters: the forecast spans two of each weekday. */
function fmtNextPass(estimateMs: number): string {
  return `${fmtDay(estimateMs)} ${fmtTime(estimateMs)}`;
}

export function TransitForecastPanel() {
  const observer = useObserverStore((s) => s.observer);

  const [watchBusy, setWatchBusy] = useState(false);
  const [watchWindows, setWatchWindows] = useState<WatchWindow[] | null>(null);
  const [watchSummary, setWatchSummary] = useState<WatchSummary | null>(null);
  const [watchError, setWatchError] = useState(false);
  /** True once the user has run the scan at least once — gates the
   *  location-change auto-rescan below so it doesn't fire on mount. */
  const watchScannedRef = useRef(false);

  const runWatchScan = useCallback(() => {
    watchScannedRef.current = true;
    setWatchBusy(true);
    setWatchError(false);
    const params = new URLSearchParams({
      lat: String(observer.lat),
      lng: String(observer.lng),
      heightM: String(observer.groundHeightMeters ?? 0),
    });
    fetch(appPath(`/api/flight-log/watch-windows?${params}`), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { windows: WatchWindow[]; summary: WatchSummary }) => {
        setWatchWindows(d.windows ?? []);
        setWatchSummary(d.summary);
      })
      .catch(() => setWatchError(true))
      .finally(() => setWatchBusy(false));
  }, [observer]);

  // Re-run automatically when the observer's location changes, but only after
  // the user has scanned at least once — otherwise this would fire an unwanted
  // request the moment the panel mounts.
  useEffect(() => {
    if (watchScannedRef.current) {
      runWatchScan();
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

  return (
    <div className="flex flex-col gap-3">
      {/* Best times to watch — from how busy the Moon's part of the sky usually is */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="mt-section-label">
            Best times to watch
          </span>
          <button
            type="button"
            onClick={runWatchScan}
            disabled={watchBusy}
            className="rounded-full border border-[color:var(--hair-soft)] px-3 py-1 text-[length:var(--fs-label)] text-[color:var(--t-secondary)] disabled:opacity-40 hover:border-[color:var(--ink-3)] hover:text-[color:var(--t-primary)] transition"
          >
            {watchBusy ? "Scanning…" : "Scan next 14 d"}
          </button>
        </div>

        <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
          When the Moon crosses the busiest part of your sky after dark, based on the last 30 days
          of traffic. It cannot name a flight: Candidates warns you about the actual aircraft 5
          minutes ahead.
        </p>

        {watchError && (
          <p className="text-[length:var(--fs-label)] text-[color:var(--disc-text)]">Scan failed — try again.</p>
        )}

        {watchSummary && !watchError && (
          <p className="text-[length:var(--fs-label)] text-[color:var(--t-secondary)]">
            Next 14 days: the Moon can be shot for {Math.round(watchSummary.usableHours)} h, about{" "}
            {formatFixed(watchSummary.expectedTransits, 1)} transits expected.
          </p>
        )}

        {watchWindows !== null && !watchError && (
          watchWindows.length > 0 ? (
            <ul className="flex max-h-48 flex-col divide-y divide-white/[0.05] overflow-y-auto">
              {watchWindows.map((w) => (
                <li
                  key={w.startMs}
                  className="flex w-full items-center gap-2 px-1.5 py-1.5 text-[length:var(--fs-label)]"
                >
                  <span className={`mt-chip shrink-0 ${w.rating === "best" ? "mt-chip-live" : "mt-chip-observer"}`}>
                    {w.rating === "best" ? "BEST" : "GOOD"}
                  </span>
                  <span className="text-[color:var(--t-primary)]">
                    {fmtDay(w.startMs)} {fmtTime(w.startMs)}–{fmtTime(w.endMs)}
                  </span>
                  <span className="ml-auto shrink-0 text-right tabular-nums text-[color:var(--t-tertiary)]">
                    ~{formatFixed(w.expectedTransits, 1)} · {compassPoint(w.moonAzDeg)} {w.moonAltDeg}°
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
              Nothing stands out in this period. In the two weeks around a new Moon it is mostly up
              in daylight or too thin to show an aircraft.
            </p>
          )
        )}

        {watchWindows !== null && watchWindows.length > 0 && !watchError && (
          <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
            ~ is how many transits to expect in that time, then where the Moon is. Dark sky, Moon
            at least 12° up and 20 % lit, aircraft within 80 km.
          </p>
        )}
      </div>

      {/* Where to stand — solves the ground point instead of fixing the observer */}
      <div className="flex flex-col gap-2 border-t border-[color:var(--hair-soft)] pt-3">
        <div className="flex items-center justify-between">
          <span className="mt-section-label">
            Where to stand
          </span>
          <button
            type="button"
            onClick={runSpotScan}
            disabled={spotBusy}
            className="rounded-full border border-[color:var(--hair-soft)] px-3 py-1 text-[length:var(--fs-label)] text-[color:var(--t-secondary)] disabled:opacity-40 hover:border-[color:var(--ink-3)] hover:text-[color:var(--t-primary)] transition"
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
            className="h-1.5 w-full min-w-0 flex-1 accent-[color:var(--ink)]"
            aria-label="Minimum aircraft coverage of the Moon, percent"
          />
          <span className="w-10 shrink-0 text-right text-[length:var(--fs-meta)] tabular-nums text-[color:var(--t-secondary)]">
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
                  ? "border-[color:var(--observer)] bg-[color:var(--panel-2)] text-[color:var(--observer-text)]"
                  : "border-[color:var(--hair-soft)] text-[color:var(--t-tertiary)] hover:border-[color:var(--ink-3)]"
              }`}
            >
              {km} km
            </button>
          ))}
        </div>

        {spotError && (
          <p className="text-[length:var(--fs-label)] text-[color:var(--disc-text)]">Scan failed — try again.</p>
        )}

        {spotData && !spotError && (
          spotData.spots.length > 0 ? (
            <>
              {spotData.matchedSpotCount > spotData.spots.length && (
                <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
                  Largest {spotData.spots.length} of {spotData.matchedSpotCount} passes. Raise the
                  minimum coverage to narrow the list.
                </p>
              )}
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
            </>
          ) : (
            <>
              <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
                Nothing reaches {minCoverage}% within {maxSpotKm} km. Best any scheduled pass can
                reach from anywhere: <span className="tabular-nums">{spotData.bestCoveragePercent}%</span>
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
  // all of it), observer for the thin end of the band, neutral below it — only
  // reachable via the `closest` near-miss list, which ignores the threshold.
  const coverageTone =
    spot.coveragePercent >= 50
      ? "mt-chip-live"
      : spot.coveragePercent >= 25
        ? "mt-chip-observer"
        : "";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(selected ? null : spot)}
        className={`flex w-full flex-col gap-0.5 rounded-[var(--r-ctl)] px-1.5 py-1.5 text-left transition ${
          selected ? "bg-[color:var(--panel-2)]" : "hover:bg-[color:var(--panel-2)]"
        }`}
        title="Show the spot and its shadow track on the map"
      >
        <span className="flex w-full items-center gap-2 text-[length:var(--fs-label)]">
          <span
            className={`mt-chip shrink-0 ${coverageTone}`}
          >
            {Math.round(spot.coveragePercent)}%
          </span>
          <span
            className={`${selected ? "text-[color:var(--observer-text)]" : "text-[color:var(--t-primary)]"}`}
          >
            {spot.callsign}
          </span>
          {spot.confidence !== "high" && (
            <span className="mt-chip shrink-0">
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
