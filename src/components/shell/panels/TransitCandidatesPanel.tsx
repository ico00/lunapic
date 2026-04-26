import { formatFixed } from "@/lib/format/numbers";
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
    <>
      <h2 className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Transit candidates
      </h2>
      {showEphemeris && isLoading && (
        <p className="mt-2 text-sm text-zinc-500">Loading…</p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
        {showEmpty && <li className="text-zinc-500">No visible tracks.</li>}
        {candidates.map((c) => (
          <li key={c.flight.id}>
            <button
              type="button"
              onClick={() => {
                onSelectFlight(c.flight.id);
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
                {formatFixed(c.separationDeg, 3)}°
                {c.isPossibleTransit ? " · ⊙" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
