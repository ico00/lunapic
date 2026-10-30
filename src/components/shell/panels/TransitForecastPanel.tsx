"use client";

import { appPath } from "@/lib/paths/appPath";
import { formatFixed } from "@/lib/format/numbers";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { PhotoSpotOpportunity, PhotoSpotsResponse } from "@/types/photoSpot";
import { useObserverStore } from "@/stores/observer-store";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Prognoza tranzita (grupa Plan): idućih 14 dana iz pravilnosti rasporeda u
 * flight-logu ("Upcoming opportunities") i obrnuti problem — gdje stati da
 * redoviti let prođe preko diska ("Where to stand"). Do 2026-10-29 je bilo
 * dio FlightLogPanela; podaci dolaze iz loga, ali pitanje je planersko.
 * Ne ovisi o odabiru u tablici loga, samo o promatraču i kameri.
 */

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
  const color = abs <= 0.26 ? "text-[color:var(--disc-text)]" : abs <= 1.5 ? "text-[color:var(--observer-text)]" : "text-[color:var(--t-tertiary)]";
  return <span className={`text-[length:var(--fs-meta)] font-medium ${color}`}>{label}</span>;
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

export function TransitForecastPanel() {
  const setFlightLogSelected = useMoonTransitStore((s) => s.setFlightLogSelected);
  const setFlightLogSelectedCallsign = useMoonTransitStore((s) => s.setFlightLogSelectedCallsign);
  const cameraFocalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const cameraSensorType = useMoonTransitStore((s) => s.cameraSensorType);
  const observer = useObserverStore((s) => s.observer);

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

  return (
    <div className="flex flex-col gap-3">
      {/* Upcoming opportunities — forward forecast from historical schedule regularity */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="mt-section-label">
            Upcoming opportunities
          </span>
          <button
            type="button"
            onClick={runCalendarScan}
            disabled={calendarBusy}
            className="rounded-full border border-[color:var(--hair-soft)] px-3 py-1 text-[length:var(--fs-label)] text-[color:var(--t-secondary)] disabled:opacity-40 hover:border-[color:var(--ink-3)] hover:text-[color:var(--t-primary)] transition"
          >
            {calendarBusy ? "Scanning…" : "Scan next 14 d"}
          </button>
        </div>

        <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
          Statistical forecast from past regularity — not a live prediction. Confirm with the live pipeline on the day.
        </p>

        {calendarError && (
          <p className="text-[length:var(--fs-label)] text-[color:var(--disc-text)]">Scan failed — try again.</p>
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
                        setFlightLogSelectedCallsign(ev.callsign);
                        setFlightLogSelected(null);
                      }}
                      className="flex w-full items-center gap-2 py-1.5 text-left text-[length:var(--fs-label)] hover:bg-[color:var(--panel-2)] transition rounded-[var(--r-ctl)] px-1.5"
                      title="Show route on map"
                    >
                      <span
                        className={`mt-chip shrink-0 ${ev.kind === "transit" ? "mt-chip-disc" : "mt-chip-observer"}`}
                      >
                        {ev.kind === "transit" ? "DISC" : "NEAR"}
                      </span>
                      <span className="text-[color:var(--t-primary)]">{ev.callsign}</span>
                      {lowConfidence && (
                        <span className="mt-chip shrink-0">
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
                        setFlightLogSelectedCallsign(ev.callsign);
                        setFlightLogSelected(null);
                      }}
                      className="flex w-full items-center gap-2 py-1.5 text-left text-[length:var(--fs-label)] hover:bg-[color:var(--panel-2)] transition rounded-[var(--r-ctl)] px-1.5"
                      title="Show route on map"
                    >
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-meta)] font-semibold ${
                          ev.inFrame
                            ? "mt-chip mt-chip-observer"
                            : "mt-chip"
                        }`}
                      >
                        {ev.inFrame ? "IN FRAME" : "OUT OF FRAME"}
                      </span>
                      <span className="text-[color:var(--t-primary)]">{ev.callsign}</span>
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
