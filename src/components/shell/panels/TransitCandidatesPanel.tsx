import { formatFixed } from "@/lib/format/numbers";
import { primeFieldAudioFromUserGesture } from "@/lib/audio/fieldAudio";
import type { TransitCandidate } from "@/types";

function ElevationGapBadge({ gap }: { gap: number | null }) {
  if (gap === null) return null;
  const abs = Math.abs(gap);
  const sign = gap >= 0 ? "+" : "−";
  const label = `Δalt ${sign}${formatFixed(abs, 2)}°`;
  if (abs <= 0.26) {
    return <span className="font-mono text-[length:var(--fs-meta)] font-medium text-emerald-400">{label}</span>;
  }
  if (abs <= 1.5) {
    return <span className="font-mono text-[length:var(--fs-meta)] font-medium text-amber-400">{label}</span>;
  }
  return <span className="font-mono text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">{label}</span>;
}

type TransitCandidatesPanelProps = {
  candidates: readonly TransitCandidate[];
  isLoading: boolean;
  error: string | null;
  showEmpty: boolean;
  showEphemeris: boolean;
  selectedFlightId: string | null;
  onSelectFlight: (id: string) => void;
  alertsEnabled: boolean;
  onToggleAlerts: () => void;
  onSubscribeToPush: () => void;
};

function CandidateRow({
  c,
  selectedFlightId,
  onSelectFlight,
  isTransit,
}: {
  c: TransitCandidate;
  selectedFlightId: string | null;
  onSelectFlight: (id: string) => void;
  isTransit: boolean;
}) {
  const selectedStyle = isTransit
    ? "border-sky-400/55 bg-sky-500/[0.10] shadow-[0_4px_16px_-8px_rgba(96,165,250,0.45)]"
    : "border-violet-400/55 bg-violet-500/[0.10] shadow-[0_4px_16px_-8px_rgba(167,139,250,0.35)]";
  const hoverStyle = isTransit
    ? "hover:border-sky-400/30 hover:bg-sky-500/[0.05]"
    : "hover:border-violet-400/30 hover:bg-violet-500/[0.05]";
  const callsignColor = isTransit ? "text-sky-300" : "text-violet-300";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectFlight(c.flight.id)}
        className={`flex min-h-[48px] w-full min-w-0 items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
          selectedFlightId === c.flight.id
            ? selectedStyle
            : `border-white/[0.10] bg-white/[0.03] ${hoverStyle}`
        }`}
      >
        <span className={`truncate font-mono text-[length:var(--fs-body)] font-semibold ${callsignColor}`}>
          {c.flight.callSign ?? c.flight.id}
        </span>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-mono text-[length:var(--fs-meta)] font-medium text-[color:var(--t-secondary)]">
            {formatFixed(c.separationDeg, 3)}°
            {c.isPossibleTransit ? " · ⊙" : ""}
          </span>
          <ElevationGapBadge gap={c.elevationGapDeg} />
        </div>
      </button>
    </li>
  );
}

export function TransitCandidatesPanel({
  candidates,
  isLoading,
  error,
  showEmpty,
  showEphemeris,
  selectedFlightId,
  onSelectFlight,
  alertsEnabled,
  onToggleAlerts,
  onSubscribeToPush,
}: TransitCandidatesPanelProps) {
  const transitCandidates = candidates.filter((c) => c.willTransit);
  const inFrameCandidates = candidates.filter((c) => !c.willTransit);

  const rowProps = { selectedFlightId, onSelectFlight };

  return (
    <div>
      {/* Alerts toggle */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">Transit alerts</p>
          <p className="text-[length:var(--fs-meta)] text-[color:var(--t-disabled)] leading-tight">
            Sound + push when a candidate appears
          </p>
        </div>
        <button
          type="button"
          data-testid="alerts-toggle"
          onClick={() => {
            if (!alertsEnabled) {
              primeFieldAudioFromUserGesture();
              onSubscribeToPush();
            }
            onToggleAlerts();
          }}
          aria-label={alertsEnabled ? "Disable transit alerts" : "Enable transit alerts"}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-[0.95] ${
            alertsEnabled
              ? "border-amber-400/55 bg-amber-500/[0.12] text-amber-200 shadow-[0_4px_16px_-8px_rgba(251,191,36,0.45)]"
              : "border-white/[0.10] bg-white/[0.03] text-[color:var(--t-tertiary)] hover:border-white/[0.18] hover:text-[color:var(--t-primary)]"
          }`}
        >
          {alertsEnabled ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
              <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Z" />
              <path d="M18 16v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2h16l-2-2Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
              <path d="M10.268 21a2 2 0 0 0 3.464 0" />
              <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
            </svg>
          )}
        </button>
      </div>

      <div className="space-y-2">
        {showEphemeris && isLoading && (
          <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">Loading…</p>
        )}
        {error && <p className="text-[length:var(--fs-meta)] text-rose-300">{error}</p>}
      </div>
      {showEphemeris && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="mb-1.5 mt-section-label">Disk transit</p>
            <ul className="space-y-2">
              {transitCandidates.length === 0 ? (
                <li className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">No disk transits predicted.</li>
              ) : (
                transitCandidates.map((c) => (
                  <CandidateRow key={c.flight.id} c={c} isTransit={true} {...rowProps} />
                ))
              )}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 mt-section-label">In frame</p>
            <ul className="space-y-2">
              {showEmpty && inFrameCandidates.length === 0 && transitCandidates.length === 0 ? (
                <li className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">No visible tracks.</li>
              ) : inFrameCandidates.length === 0 ? (
                <li className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">None within current FOV.</li>
              ) : (
                inFrameCandidates.map((c) => (
                  <CandidateRow key={c.flight.id} c={c} isTransit={false} {...rowProps} />
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
