import { formatFixed } from "@/lib/format/numbers";
import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconObserver } from "@/components/shell/sectionCategoryIcons";
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
    <ShellSectionCard
      className="mt-3"
      title="Observer"
      accent="rose"
      icon={<SectionIconObserver />}
    >
      <dl className="space-y-0.5 font-mono text-xs tabular-nums text-zinc-300">
        <div className="flex justify-between gap-2">
          <dt>φ</dt>
          <dd>{formatFixed(observer.lat, 5)}°</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>λ</dt>
          <dd>{formatFixed(observer.lng, 5)}°</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Ground elevation (m)</dt>
          <dd>{formatFixed(observer.groundHeightMeters, 0)}</dd>
        </div>
      </dl>
      <div className="mt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={onUseGps}
          disabled={gpsBusy || locationActionsDisabled}
          className="rounded-md border border-blue-500/35 bg-blue-500/10 px-2 py-1.5 text-sm text-yellow-400/90 transition hover:border-blue-400/50 disabled:opacity-50"
        >
          {gpsBusy ? "GPS…" : "Use my GPS"}
        </button>
        {gpsError && <p className="text-xs text-red-400/90">{gpsError}</p>}
      </div>
    </ShellSectionCard>
  );
}
