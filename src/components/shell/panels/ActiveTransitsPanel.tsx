import { formatFixed } from "@/lib/format/numbers";
import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconTransitsList } from "@/components/shell/sectionCategoryIcons";
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
    <ShellSectionCard
      className="mt-3"
      title="Active transits"
      accent="amber"
      icon={<SectionIconTransitsList />}
    >
      <p className="text-xs leading-snug text-zinc-500">
        Moon and aircraft azimuth (from altitude) within{" "}
        <span className="font-mono">0.5°</span> — on the “yellow ray.”
      </p>
      {showEphemeris && (
        <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto text-sm">
          {rows.length === 0 && (
            <li className="text-zinc-500">Nobody on the ray.</li>
          )}
          {rows.map((row) => (
            <li key={row.flight.id} className="list-none">
              <button
                type="button"
                onClick={() => {
                  onSelectFlight(row.flight.id);
                }}
                className={`w-full space-y-1.5 rounded-lg border px-2 py-1.5 text-left transition ${
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
                    Δ {formatFixed(row.deltaAzDeg, 2)}°
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
    </ShellSectionCard>
  );
}
