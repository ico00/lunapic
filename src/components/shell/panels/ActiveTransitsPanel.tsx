import { formatFixed } from "@/lib/format/numbers";
import type { ActiveTransitRow } from "@/hooks/useActiveTransits";
import { useEffect, useRef } from "react";

function playCenteredChime() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    // Two rising tones — short confirmation chime
    const notes = [880, 1320];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.36);
    });

    setTimeout(() => ctx.close(), 1200);
  } catch {
    // AudioContext blocked (e.g. no user gesture yet) — silently skip
  }
}

type ActiveTransitsPanelProps = {
  rows: readonly ActiveTransitRow[];
  showEphemeris: boolean;
  selectedFlightId: string | null;
  onSelectFlight: (id: string) => void;
  /** Planning mode (budući datum): živi transiti su pauzirani, prikaži napomenu. */
  planningMode?: boolean;
};

function bearingToCardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function useCenteredChime(meters: number | null) {
  const wasCentered = useRef(false);
  useEffect(() => {
    const isCentered = meters !== null && meters < 5;
    if (isCentered && !wasCentered.current) {
      playCenteredChime();
    }
    wasCentered.current = isCentered;
  }, [meters]);
}

function NudgeArrow({
  meters,
  bearingDeg,
}: {
  meters: number;
  bearingDeg: number;
}) {
  if (meters < 5) {
    return (
      <div className="mt-3 flex flex-col items-center gap-1.5 rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.08] py-4">
        <span className="text-[length:var(--fs-h1)] leading-none text-emerald-400">✓</span>
        <span className="font-mono text-[length:var(--fs-meta)] font-semibold text-emerald-400">
          Centered
        </span>
      </div>
    );
  }

  const cardinal = bearingToCardinal(bearingDeg);
  const m = Math.round(meters);

  return (
    <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-4">
      <span className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
        Walk {cardinal}
      </span>
      <div
        style={{ transform: `rotate(${bearingDeg}deg)` }}
        className="transition-transform duration-500"
      >
        <svg
          viewBox="0 0 24 40"
          className="h-12 w-7 drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]"
          aria-hidden
        >
          <path
            d="M12 2 L22 18 H15.5 V38 H8.5 V18 H2 Z"
            fill="rgba(251,191,36,0.92)"
            stroke="rgba(251,191,36,0.35)"
            strokeWidth="0.5"
          />
        </svg>
      </div>
      <span className="font-mono text-[length:var(--fs-h1)] font-bold leading-none tabular-nums text-amber-300">
        {m} m
      </span>
    </div>
  );
}

export function ActiveTransitsPanel({
  rows,
  showEphemeris,
  selectedFlightId,
  onSelectFlight,
  planningMode = false,
}: ActiveTransitsPanelProps) {
  const selectedRow = rows.find((r) => r.flight.id === selectedFlightId) ?? null;
  useCenteredChime(selectedRow?.nudgeMeters ?? null);

  if (planningMode) {
    return (
      <div>
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[length:var(--fs-meta)] leading-relaxed text-amber-300/90">
          Planning a future date — active transits need live traffic, so this
          list is paused. Press Sync to return to live traffic.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[length:var(--fs-body)] leading-relaxed text-[color:var(--t-secondary)]">
        Aircraft within{" "}
        <span className="font-mono font-semibold text-amber-300">0.5°</span>{" "}
        of the moon disc — full sky separation (azimuth + elevation).
      </p>
      {showEphemeris && (
        <>
          <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto">
            {rows.length === 0 && (
              <li className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">Nobody on the ray.</li>
            )}
            {rows.map((row) => (
              <li key={row.flight.id} className="list-none">
                <button
                  type="button"
                  onClick={() => {
                    onSelectFlight(row.flight.id);
                  }}
                  className={`min-h-[56px] w-full space-y-1.5 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                    selectedFlightId === row.flight.id
                      ? "border-amber-400/55 bg-amber-500/[0.10] shadow-[0_4px_16px_-8px_rgba(251,191,36,0.45)]"
                      : "border-white/[0.10] bg-white/[0.03] hover:border-amber-400/30 hover:bg-amber-500/[0.05]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[length:var(--fs-body-strong)] font-semibold text-amber-300">
                      {row.flight.callSign ?? row.flight.id}
                    </span>
                    <span className="shrink-0 font-mono text-[length:var(--fs-body-strong)] font-bold text-sky-300">
                      Δ {formatFixed(row.separationDeg, 2)}°
                    </span>
                  </div>
                  <p className="text-[length:var(--fs-meta)] leading-snug text-[color:var(--t-secondary)]">
                    {row.nudgeLine}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {selectedRow && (
            <NudgeArrow
              meters={selectedRow.nudgeMeters}
              bearingDeg={selectedRow.nudgeBearingDeg}
            />
          )}
        </>
      )}
    </div>
  );
}
