import { formatFixed } from "@/lib/format/numbers";
import type { TransitCandidate } from "@/types";

function CandidateWatchIcon({
  disabled,
  active,
}: {
  disabled: boolean;
  active: boolean;
}) {
  const cls = "h-[18px] w-[18px] shrink-0";
  if (disabled) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cls}
        aria-hidden
      >
        <path d="M8.7 3h-.7a4 4 0 0 0-4 4v2.1l-1.4 1.4a1 1 0 0 0 .7 1.7H6" />
        <path d="M15.7 21h.6a4 4 0 0 0 4-4v-2.1l1.4-1.4a1 1 0 0 0-.7-1.7H18" />
        <path d="M10.3 21a2 2 0 0 0 3.4 0" />
        <path d="M3 3l18 18" />
      </svg>
    );
  }
  if (active) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cls}
        aria-hidden
      >
        <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Z" />
        <path d="M18 16v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2h16l-2-2Z" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cls}
      aria-hidden
    >
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  );
}

type TransitCandidatesPanelProps = {
  candidates: readonly TransitCandidate[];
  isLoading: boolean;
  error: string | null;
  showEmpty: boolean;
  showEphemeris: boolean;
  selectedFlightId: string | null;
  notificationsSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  watchedFlightIds: ReadonlySet<string>;
  onSelectFlight: (id: string) => void;
  onToggleWatchFlight: (id: string) => void;
};

export function TransitCandidatesPanel({
  candidates,
  isLoading,
  error,
  showEmpty,
  showEphemeris,
  selectedFlightId,
  notificationsSupported,
  notificationPermission,
  watchedFlightIds,
  onSelectFlight,
  onToggleWatchFlight,
}: TransitCandidatesPanelProps) {
  void notificationPermission;
  return (
    <div>
      <div className="space-y-2">
        {showEphemeris && isLoading && (
          <p className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">Loading…</p>
        )}
        {error && <p className="text-[length:var(--fs-meta)] text-rose-300">{error}</p>}
      </div>
      <ul className="mt-3 space-y-2">
        {showEmpty && (
          <li className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">No visible tracks.</li>
        )}
        {candidates.map((c) => (
          <li key={c.flight.id}>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => {
                  onSelectFlight(c.flight.id);
                }}
                className={`flex min-h-[48px] min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                  selectedFlightId === c.flight.id
                    ? "border-sky-400/55 bg-sky-500/[0.10] shadow-[0_4px_16px_-8px_rgba(96,165,250,0.45)]"
                    : "border-white/[0.10] bg-white/[0.03] hover:border-sky-400/30 hover:bg-sky-500/[0.05]"
                }`}
              >
                <span className="truncate font-mono text-[length:var(--fs-body)] font-semibold text-sky-300">
                  {c.flight.callSign ?? c.flight.id}
                </span>
                <span className="shrink-0 font-mono text-[length:var(--fs-meta)] font-medium text-[color:var(--t-secondary)]">
                  {formatFixed(c.separationDeg, 3)}°
                  {c.isPossibleTransit ? " · ⊙" : ""}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleWatchFlight(c.flight.id);
                }}
                disabled={!notificationsSupported}
                className={`flex shrink-0 items-center justify-center rounded-2xl border transition active:scale-[0.95] max-md:h-12 max-md:min-w-12 max-md:px-0 md:h-11 md:w-11 md:px-0 ${
                  !notificationsSupported
                    ? "cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-zinc-600"
                    : watchedFlightIds.has(c.flight.id)
                      ? "border-amber-400/55 bg-amber-500/[0.12] text-amber-200 shadow-[0_4px_16px_-8px_rgba(251,191,36,0.45)]"
                      : "border-white/[0.10] bg-white/[0.03] text-zinc-400 hover:border-white/[0.18] hover:text-zinc-200"
                }`}
                aria-label={
                  !notificationsSupported
                    ? "Alerts are not supported in this browser context"
                    : watchedFlightIds.has(c.flight.id)
                      ? "Disable alert for this candidate"
                      : "Enable alert for this candidate"
                }
                title={
                  !notificationsSupported
                    ? "Alerts unavailable here"
                    : watchedFlightIds.has(c.flight.id)
                      ? "Alert enabled"
                      : "Alert disabled"
                }
              >
                <CandidateWatchIcon
                  disabled={!notificationsSupported}
                  active={watchedFlightIds.has(c.flight.id)}
                />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
