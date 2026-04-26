import { formatFixed } from "@/lib/format/numbers";
import type { GroundObserver } from "@/types";

type ObserverLocationPanelProps = {
  observer: GroundObserver;
  onUseGps: () => void;
  gpsBusy: boolean;
  gpsError: string | null;
  onFocusMapOnObserver: () => void;
  locationActionsDisabled: boolean;
};

export function ObserverLocationPanel({
  observer,
  onUseGps,
  gpsBusy,
  gpsError,
  onFocusMapOnObserver,
  locationActionsDisabled,
}: ObserverLocationPanelProps) {
  return (
    <>
      <h2 className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Observer
      </h2>
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
        Fixed point (does not follow pan) — all ephemeris and intersection math
        use this.
      </p>
      <dl className="mt-2 space-y-0.5 font-mono text-xs tabular-nums text-zinc-300">
        <div className="flex justify-between gap-2">
          <dt>φ</dt>
          <dd>{formatFixed(observer.lat, 5)}°</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>λ</dt>
          <dd>{formatFixed(observer.lng, 5)}°</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Ground alt. (ellipsoid)</dt>
          <dd>{formatFixed(observer.groundHeightMeters, 0)} m</dd>
        </div>
      </dl>
      <div className="mt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={onUseGps}
          disabled={gpsBusy || locationActionsDisabled}
          className="rounded border border-sky-800/50 bg-sky-950/30 px-2 py-1.5 text-sm text-sky-200/90 transition hover:border-sky-500/50 disabled:opacity-50"
        >
          {gpsBusy ? "GPS…" : "Use my GPS"}
        </button>
        {gpsError && <p className="text-xs text-red-400/90">{gpsError}</p>}
        <button
          type="button"
          onClick={onFocusMapOnObserver}
          className="rounded border border-zinc-600 bg-zinc-800/50 px-2 py-1.5 text-sm text-zinc-200 transition hover:border-amber-500/40 hover:text-white"
        >
          Focus on me
        </button>
      </div>
    </>
  );
}
