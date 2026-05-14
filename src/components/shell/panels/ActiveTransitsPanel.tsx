import { formatFixed } from "@/lib/format/numbers";
import type { ActiveTransitRow } from "@/hooks/useActiveTransits";

type ActiveTransitsPanelProps = {
  rows: readonly ActiveTransitRow[];
  showEphemeris: boolean;
  selectedFlightId: string | null;
  onSelectFlight: (id: string) => void;
};

export function ActiveTransitsPanel({
  rows,
  showEphemeris,
  selectedFlightId,
  onSelectFlight,
}: ActiveTransitsPanelProps) {
  return (
    <div>
      <p className="text-[length:var(--fs-body)] leading-relaxed text-[color:var(--t-secondary)]">
        Moon and aircraft azimuth (from altitude) within{" "}
        <span className="font-mono font-semibold text-amber-300">0.5°</span> — on the “yellow ray.”
      </p>
      {showEphemeris && (
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
                    Δ {formatFixed(row.deltaAzDeg, 2)}°
                  </span>
                </div>
                <p className="text-[length:var(--fs-meta)] leading-snug text-[color:var(--t-secondary)]">
                  {row.nudgeLine}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
