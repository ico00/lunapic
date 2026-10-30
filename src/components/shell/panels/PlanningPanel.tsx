"use client";

import { RunwayInUseNote, useRunwayInUse } from "@/components/shell/panels/RunwayInUseNote";
import { ShellSelect, type ShellSelectOption } from "@/components/shell/ShellSelect";
import {
  computeBestPlanningDays,
  suggestedPlanRange,
  type PlanningDay,
  type PlanningWindow,
} from "@/lib/domain/geometry/runwayPlanDays";
import {
  computeRunwayShadowPlan,
  moonAltitudeAtAirportDeg,
  type RunwayFlow,
  type RunwayShadowLine,
} from "@/lib/domain/geometry/runwayShadowPlan";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { formatFixed } from "@/lib/format/numbers";
import { formatPlanTime } from "@/lib/map/runwayShadowPlanFeatures";
import { shellAccentCheckboxClass } from "@/lib/ui/shellComboboxStyles";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useEffect, useMemo, useState } from "react";

/** Safety valve: ~12 h at 10 min, per flow. Beyond this the map is unreadable anyway. */
const MAX_SAMPLES = 72;
const DAYS_AHEAD = 30;
const SLOT_MINUTES = 10;

const STEP_OPTIONS: readonly ShellSelectOption[] = [
  { value: "5", label: "Every 5 min" },
  { value: "10", label: "Every 10 min" },
  { value: "15", label: "Every 15 min" },
  { value: "30", label: "Every 30 min" },
];

/**
 * Floor on the aircraft's width in Moon diameters. Floor only (as in the Flight
 * log scan): an aircraft wider than the disk is a wanted result, never filtered.
 */
const MIN_SIZE_OPTIONS: readonly ShellSelectOption[] = [
  { value: "0", label: "Any size" },
  { value: "100", label: "≥ 1× Moon" },
  { value: "150", label: "≥ 1.5× Moon" },
  { value: "200", label: "≥ 2× Moon" },
  { value: "300", label: "≥ 3× Moon" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const TIME_OPTIONS: readonly ShellSelectOption[] = Array.from(
  { length: (24 * 60) / SLOT_MINUTES },
  (_, i) => {
    const m = i * SLOT_MINUTES;
    const v = `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
    return { value: v, label: v };
  }
);

function buildDateOptions(nowMs: number): ShellSelectOption[] {
  const out: ShellSelectOption[] = [];
  const base = new Date(nowMs);
  for (let i = 0; i < DAYS_AHEAD; i += 1) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const text = d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
    out.push({ value: dateKey(d), label: i === 0 ? `${text} (today)` : text });
  }
  return out;
}

/** Local wall-clock instant for a `YYYY-MM-DD` key + `HH:MM`. */
function localInstantMs(key: string, hhmm: string): number {
  const [y, mo, d] = key.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(y!, mo! - 1, d!, h!, m!, 0, 0).getTime();
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const GUIDE_STORAGE_KEY = "lunapic.planning.guideHidden";
const BEST_DAYS_COLLAPSED_COUNT = 7;

function readGuideHidden(): boolean {
  try {
    return globalThis.localStorage?.getItem(GUIDE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeGuideHidden(hidden: boolean) {
  try {
    globalThis.localStorage?.setItem(GUIDE_STORAGE_KEY, hidden ? "1" : "0");
  } catch {
    /* privatni prozor / blokirano — uputa se samo vrati pri sljedećem otvaranju */
  }
}

/**
 * Prvi prozor u kojem je Mjesec dovoljno visoko, računajući od sada: panel se
 * otvara na nečemu što ima linije, a ne na praznom danu.
 */
function firstUsefulWindow(
  days: readonly PlanningDay[],
  nowMs: number
): { date: string; from: string; to: string } | null {
  for (const day of days) {
    for (const w of day.windows) {
      if (w.endMs <= nowMs) continue;
      const slotMs = SLOT_MINUTES * 60_000;
      const start = Math.max(w.startMs, Math.ceil(nowMs / slotMs) * slotMs);
      if (start > w.endMs) continue;
      const range = suggestedPlanRange({ ...w, startMs: start });
      return { date: day.dateKey, from: hhmm(range.startMs), to: hhmm(range.endMs) };
    }
  }
  return null;
}

/** Next slot boundary after `nowMs`, clamped to the last slot of its day. */
function defaultWindow(nowMs: number): { date: string; from: string; to: string } {
  const now = new Date(nowMs);
  const mins = now.getHours() * 60 + now.getMinutes();
  const fromMin = Math.min(Math.ceil((mins + 1) / SLOT_MINUTES) * SLOT_MINUTES, 24 * 60 - SLOT_MINUTES);
  const toMin = Math.min(fromMin + 90, 24 * 60 - SLOT_MINUTES);
  const fmt = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  return { date: dateKey(now), from: fmt(fromMin), to: fmt(toMin) };
}

type InstantRow = {
  atMs: number;
  moonAltitudeDeg: number;
  moonAzimuthDeg: number;
  bestCoveragePercent: number;
  lines: RunwayShadowLine[];
};

function groupByInstant(lines: readonly RunwayShadowLine[]): InstantRow[] {
  const rows = new Map<number, InstantRow>();
  for (const line of lines) {
    const best = Math.max(...line.points.map((p) => p.coveragePercent));
    const row = rows.get(line.atMs);
    if (row) {
      row.lines.push(line);
      row.bestCoveragePercent = Math.max(row.bestCoveragePercent, best);
    } else {
      rows.set(line.atMs, {
        atMs: line.atMs,
        moonAltitudeDeg: line.moonAltitudeDeg,
        moonAzimuthDeg: line.moonAzimuthDeg,
        bestCoveragePercent: best,
        lines: [line],
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.atMs - b.atMs);
}

const FLOW_LABEL: Record<RunwayFlow, string> = {
  landing04: "Landing 04",
  departure22: "Departure 22",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.14em] text-[color:var(--t-tertiary)]">
      {children}
    </span>
  );
}

export function PlanningPanel() {
  const setRunwayPlanLines = useMoonTransitStore((s) => s.setRunwayPlanLines);
  const focusMs = useMoonTransitStore((s) => s.runwayPlanFocusMs);
  const setFocusMs = useMoonTransitStore((s) => s.setRunwayPlanFocusMs);
  const showAllTimes = useMoonTransitStore((s) => s.runwayPlanShowAll);
  const setShowAllTimes = useMoonTransitStore((s) => s.setRunwayPlanShowAll);

  const [initial] = useState(() => {
    const now = Date.now();
    const days = computeBestPlanningDays(now, DAYS_AHEAD);
    return { now, dates: buildDateOptions(now), days, window: firstUsefulWindow(days, now) ?? defaultWindow(now) };
  });
  const runwayInUse = useRunwayInUse();
  const [guideHidden, setGuideHidden] = useState(readGuideHidden);
  const [allDays, setAllDays] = useState(false);
  const [date, setDate] = useState(initial.window.date);
  const [from, setFrom] = useState(initial.window.from);
  const [to, setTo] = useState(initial.window.to);
  const [stepMin, setStepMin] = useState("10");
  const [minSize, setMinSize] = useState("150");
  const [landing, setLanding] = useState(true);
  const [departure, setDeparture] = useState(true);

  const flows = useMemo<RunwayFlow[]>(
    () => [...(landing ? (["landing04"] as const) : []), ...(departure ? (["departure22"] as const) : [])],
    [landing, departure]
  );

  const startMs = localInstantMs(date, from);
  const endMs = localInstantMs(date, to);
  const stepMs = Number(stepMin) * 60_000;
  const spanValid = endMs >= startMs;
  const sampleCount = spanValid ? Math.floor((endMs - startMs) / stepMs) + 1 : 0;
  const truncated = sampleCount > MAX_SAMPLES;

  const lines = useMemo(() => {
    if (!spanValid || flows.length === 0) return [];
    const cappedEnd = truncated ? startMs + (MAX_SAMPLES - 1) * stepMs : endMs;
    return computeRunwayShadowPlan({
      startMs,
      endMs: cappedEnd,
      stepMs,
      flows,
      minCoveragePercent: Number(minSize),
    });
  }, [spanValid, flows, truncated, startMs, endMs, stepMs, minSize]);

  const rows = useMemo(() => groupByInstant(lines), [lines]);

  // Publish to the map; take the lines off it when the panel closes.
  useEffect(() => {
    setRunwayPlanLines(lines);
  }, [lines, setRunwayPlanLines]);
  useEffect(
    () => () => {
      setRunwayPlanLines([]);
      setFocusMs(null);
      setShowAllTimes(false);
    },
    [setRunwayPlanLines, setFocusMs, setShowAllTimes]
  );
  // Default view draws ONE time (the first); "show all" keeps whatever is focused.
  // A focused instant that the new inputs no longer produce would draw/dim nothing.
  useEffect(() => {
    const valid = focusMs !== null && rows.some((r) => r.atMs === focusMs);
    if (valid) return;
    setFocusMs(showAllTimes || rows.length === 0 ? null : rows[0]!.atMs);
  }, [rows, focusMs, showAllTimes, setFocusMs]);

  const applyWindow = (day: PlanningDay, w: PlanningWindow) => {
    const range = suggestedPlanRange(w);
    setDate(day.dateKey);
    setFrom(hhmm(range.startMs));
    setTo(hhmm(range.endMs));
  };

  const moonAtStartDeg = useMemo(() => moonAltitudeAtAirportDeg(startMs), [startMs]);
  const moonLow = moonAtStartDeg < CRITICAL_BELOW_DEG;

  return (
    <div className="space-y-4" data-testid="planning-panel">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>Zagreb LDZA — runway 04/22</FieldLabel>
          <button
            type="button"
            onClick={() => {
              setGuideHidden((h) => {
                writeGuideHidden(!h);
                return !h;
              });
            }}
            aria-expanded={!guideHidden}
            className="rounded-full border border-white/10 px-2.5 py-0.5 text-[length:var(--fs-label)] text-[color:var(--t-secondary)] transition hover:border-white/20 hover:text-[color:var(--t-primary)]"
          >
            {guideHidden ? "How to use" : "Hide"}
          </button>
        </div>
        <p className="text-[length:var(--fs-meta)] text-[color:var(--t-secondary)]">
          Where to stand so an A320 on final or climb-out crosses the Moon at the chosen time.
        </p>
        <RunwayInUseNote status={runwayInUse} />
        {guideHidden ? null : (
          <ol className="list-decimal space-y-1 rounded-xl border border-sky-400/25 bg-sky-500/[0.07] py-2 pl-7 pr-3 text-[length:var(--fs-meta)] text-[color:var(--t-secondary)]">
            <li>
              <span className="text-[color:var(--t-primary)]">Pick a day</span> below — the Moon must be up.
              Tap a window to load it.
            </li>
            <li>
              <span className="text-[color:var(--t-primary)]">Tap a time</span> in the list. The map shows
              one green line for it.
            </li>
            <li>
              <span className="text-[color:var(--t-primary)]">Stand on that line</span> at that time. Your
              spot along it decides how far from the runway the aircraft is when it crosses the Moon
              (dots: 4–12 km, label: aircraft size in Moon widths).
            </li>
            <li>
              Which runway is in use depends on the wind. The status above is for right now, so
              check it again on the day.
            </li>
          </ol>
        )}
      </div>

      <div className="space-y-1">
        <FieldLabel>Days with the Moon up</FieldLabel>
        <ul className="divide-y divide-white/[0.06]" data-testid="planning-days">
          {initial.days
            .filter((d) => allDays || d.windows.length > 0)
            .slice(0, allDays ? undefined : BEST_DAYS_COLLAPSED_COUNT)
            .map((d) => {
              const lit = d.illuminationFraction;
              const label = new Date(d.dayStartMs).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "2-digit",
                month: "short",
              });
              return (
                <li
                  key={d.dateKey}
                  className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-[length:var(--fs-label)] ${
                    d.dateKey === date ? "bg-sky-500/15" : ""
                  }`}
                >
                  <span className="w-[5.5rem] shrink-0 font-mono text-[color:var(--t-primary)]">{label}</span>
                  {lit === null ? (
                    <span className="text-[color:var(--t-tertiary)]">Moon too low</span>
                  ) : (
                    <>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-meta)] font-semibold ${
                          lit >= 0.85
                            ? "bg-emerald-500/25 text-emerald-300"
                            : lit >= 0.5
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-white/[0.05] text-[color:var(--t-tertiary)]"
                        }`}
                      >
                        {formatFixed(lit * 100, 0)}% lit
                      </span>
                      {d.windows.map((w) => (
                        <button
                          key={w.startMs}
                          type="button"
                          onClick={() => applyWindow(d, w)}
                          className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[length:var(--fs-meta)] text-[color:var(--t-secondary)] transition hover:border-sky-500/35 hover:text-[color:var(--t-primary)]"
                        >
                          {hhmm(w.startMs)}–{hhmm(w.endMs)}
                        </button>
                      ))}
                    </>
                  )}
                </li>
              );
            })}
        </ul>
        <button
          type="button"
          onClick={() => setAllDays((v) => !v)}
          className="rounded-full border border-white/10 px-3 py-1 text-[length:var(--fs-label)] text-[color:var(--t-secondary)] transition hover:border-white/20 hover:text-[color:var(--t-primary)]"
        >
          {allDays ? "Show fewer days" : `Show all ${DAYS_AHEAD} days`}
        </button>
      </div>

      <div className="space-y-2">
        <FieldLabel>Day</FieldLabel>
        <ShellSelect
          value={date}
          options={initial.dates}
          onChange={setDate}
          ariaLabel="Planning day"
          testId="planning-date-select"
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <FieldLabel>From</FieldLabel>
            <ShellSelect
              value={from}
              options={TIME_OPTIONS}
              onChange={setFrom}
              ariaLabel="Plan from"
              testId="planning-from-select"
            />
          </div>
          <div className="space-y-1">
            <FieldLabel>To</FieldLabel>
            <ShellSelect
              value={to}
              options={TIME_OPTIONS}
              onChange={setTo}
              ariaLabel="Plan to"
              testId="planning-to-select"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <FieldLabel>Lines</FieldLabel>
            <ShellSelect
              value={stepMin}
              options={STEP_OPTIONS}
              onChange={setStepMin}
              ariaLabel="Line interval"
              testId="planning-step-select"
            />
          </div>
          <div className="space-y-1">
            <FieldLabel>Aircraft size</FieldLabel>
            <ShellSelect
              value={minSize}
              options={MIN_SIZE_OPTIONS}
              onChange={setMinSize}
              ariaLabel="Minimum aircraft size in Moon diameters"
              testId="planning-size-select"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {(
          [
            ["landing04", landing, setLanding],
            ["departure22", departure, setDeparture],
          ] as const
        ).map(([flow, checked, set]) => (
          <label
            key={flow}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--fs-body)] transition ${
              checked
                ? "bg-sky-500/15 text-sky-200"
                : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            }`}
          >
            <input
              type="checkbox"
              className={shellAccentCheckboxClass}
              checked={checked}
              onChange={(e) => set(e.target.checked)}
            />
            <span>{FLOW_LABEL[flow]}</span>
            <span className="ml-auto text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
              {flow === "landing04" ? "solid line" : "dashed line"}
            </span>
          </label>
        ))}
      </div>

      {!spanValid ? (
        <p className="text-[length:var(--fs-label)] text-rose-300">End time must not be before start.</p>
      ) : null}
      {truncated ? (
        <p className="text-[length:var(--fs-label)] text-amber-300/90">
          Showing the first {MAX_SAMPLES} lines — narrow the window or use a longer interval.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>Moon at {formatPlanTime(startMs)}</FieldLabel>
          <span className="font-mono text-[length:var(--fs-meta)] text-[color:var(--t-secondary)]">
            {formatFixed(moonAtStartDeg, 0)}° alt
          </span>
        </div>
        {moonLow ? (
          <p className="text-[length:var(--fs-label)] text-amber-300/90">
            Moon is below {CRITICAL_BELOW_DEG}° at the start — no lines are drawn until it rises higher.
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <FieldLabel>
          {rows.length > 0 ? `${rows.length} ${rows.length === 1 ? "time" : "times"}` : "Times"}
        </FieldLabel>
        {rows.length > 1 ? (
          <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[length:var(--fs-meta)] text-[color:var(--t-secondary)]">
            <input
              type="checkbox"
              className={shellAccentCheckboxClass}
              checked={showAllTimes}
              onChange={(e) => setShowAllTimes(e.target.checked)}
            />
            <span>Show all times on the map</span>
          </label>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
            {flows.length === 0
              ? "Pick at least one flow."
              : "No lines — the Moon is too low, or nothing reaches the selected size."}
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {rows.map((r) => {
              const selected = focusMs === r.atMs;
              return (
                <li key={r.atMs}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFocusMs(selected && showAllTimes ? null : r.atMs)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[length:var(--fs-label)] transition ${
                      selected ? "bg-sky-500/15 ring-1 ring-sky-400/70" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="w-11 shrink-0 font-mono font-semibold text-[color:var(--t-primary)]">
                      {formatPlanTime(r.atMs)}
                    </span>
                    <span className="min-w-0 flex-1 text-[color:var(--t-secondary)]">
                      Moon {formatFixed(r.moonAltitudeDeg, 0)}° · az {formatFixed(r.moonAzimuthDeg, 0)}°
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-meta)] font-semibold ${
                        r.bestCoveragePercent >= 200
                          ? "bg-emerald-500/25 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      up to {formatFixed(r.bestCoveragePercent / 100, 1)}×
                    </span>
                  </button>
                  {selected ? (
                    <ul className="space-y-0.5 px-2 pb-2 pt-1 text-[length:var(--fs-meta)] text-[color:var(--t-secondary)]">
                      {r.lines.map((l) => {
                        const near = l.points[0]!;
                        const far = l.points[l.points.length - 1]!;
                        const tolMin = Math.min(...l.points.map((p) => p.crossTrackToleranceM));
                        const tolMax = Math.max(...l.points.map((p) => p.crossTrackToleranceM));
                        return (
                          <li key={l.flow}>
                            <span className="text-[color:var(--t-primary)]">{FLOW_LABEL[l.flow]}</span>
                            {" — aircraft "}
                            {formatFixed(near.distanceKm, 1)}–{formatFixed(far.distanceKm, 1)} km out, stand within ±
                            {formatFixed(tolMin, 0)}–{formatFixed(tolMax, 0)} m of the line.
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="rounded-xl border border-dashed border-zinc-600/40 bg-zinc-950/35 px-3 py-2 text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
        Any point on a line puts the aircraft on the Moon at that time. Where you stand along it sets how far from
        the runway that happens (dots: 4, 6, 8, 10, 12 km; label: aircraft width in Moon diameters). Assumes a 3°
        glide with 15 m threshold height, an 8 % climb-out and an A320 (35.8 m); terrain is not modelled.
      </p>
    </div>
  );
}
