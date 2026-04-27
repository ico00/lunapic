import { formatFixed } from "@/lib/format/numbers";
import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconTarget } from "@/components/shell/sectionCategoryIcons";
import type { TransitCandidate } from "@/types";

type TransitCandidatesPanelProps = {
  candidates: readonly TransitCandidate[];
  isLoading: boolean;
  error: string | null;
  showEmpty: boolean;
  showEphemeris: boolean;
  selectedFlightId: string | null;
  onSelectFlight: (id: string) => void;
};

export function TransitCandidatesPanel({
  candidates,
  isLoading,
  error,
  showEmpty,
  showEphemeris,
  selectedFlightId,
  onSelectFlight,
}: TransitCandidatesPanelProps) {
  return (
    <ShellSectionCard
      className="mt-3"
      title="Transit candidates"
      accent="emerald"
      icon={<SectionIconTarget />}
    >
      <div className="space-y-2">
        {showEphemeris && isLoading && (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
      <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-sm">
        {showEmpty && <li className="text-zinc-500">No visible tracks.</li>}
        {candidates.map((c) => (
          <li key={c.flight.id}>
            <button
              type="button"
              onClick={() => {
                onSelectFlight(c.flight.id);
              }}
              className={`flex w-full justify-between gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                selectedFlightId === c.flight.id
                  ? "border-sky-400/60 bg-sky-950/40"
                  : "border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-600"
              }`}
            >
              <span className="truncate font-mono text-xs text-sky-300">
                {c.flight.callSign ?? c.flight.id}
              </span>
              <span className="shrink-0 font-mono text-xs text-zinc-400">
                {formatFixed(c.separationDeg, 3)}°
                {c.isPossibleTransit ? " · ⊙" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </ShellSectionCard>
  );
}
