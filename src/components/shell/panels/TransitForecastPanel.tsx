"use client";

import { appPath } from "@/lib/paths/appPath";
import { formatFixed } from "@/lib/format/numbers";
import { useObserverStore } from "@/stores/observer-store";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Prognoza tranzita (grupa Plan): najbolji termini za gledanje iz gustoće prometa
 * po nebu. Podaci dolaze iz loga, ali pitanje je planersko. Ne ovisi o odabiru u
 * tablici loga, samo o promatraču.
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

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 8-point compass label for a true bearing. */
function compassPoint(bearingDeg: number): string {
  return COMPASS_POINTS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8]!;
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
    </div>
  );
}
