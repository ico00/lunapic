import { formatFixed } from "@/lib/format/numbers";
import type { GroundObserver } from "@/types";

type ObserverLocationPanelProps = {
  observer: GroundObserver;
  onUseGps: () => void;
  gpsBusy: boolean;
  gpsError: string | null;
  locationActionsDisabled: boolean;
};

export function ObserverLocationPanel({
  observer,
  onUseGps,
  gpsBusy,
  gpsError,
  locationActionsDisabled,
}: ObserverLocationPanelProps) {
  return (
    <div>
      <dl className="space-y-1.5 font-mono text-[length:var(--fs-meta)] tabular-nums text-[color:var(--t-primary)]">
        <div className="flex justify-between gap-2">
          <dt className="text-[color:var(--t-tertiary)]">φ</dt>
          <dd>{formatFixed(observer.lat, 5)}°</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[color:var(--t-tertiary)]">λ</dt>
          <dd>{formatFixed(observer.lng, 5)}°</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[color:var(--t-tertiary)]">Elevation</dt>
          <dd>{formatFixed(observer.groundHeightMeters, 0)} m</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={onUseGps}
          disabled={gpsBusy || locationActionsDisabled}
          className="min-h-[48px] rounded-2xl border border-sky-500/35 bg-sky-500/[0.10] px-3 py-3 text-[length:var(--fs-body)] font-semibold text-sky-200 transition hover:border-sky-400/55 hover:bg-sky-500/[0.16] active:scale-[0.98] disabled:opacity-50"
        >
          {gpsBusy ? "Locating…" : "Use my GPS"}
        </button>
        {gpsError && <p className="text-[length:var(--fs-meta)] text-rose-300">{gpsError}</p>}
      </div>
    </div>
  );
}
