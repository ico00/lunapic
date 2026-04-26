import {
  formatCountdown,
  type PhotographerToolPack,
} from "@/hooks/usePhotographerTools";
import { formatFixed } from "@/lib/format/numbers";

type PhotographerToolsPanelProps = {
  selectedFlightId: string | null;
  photoPack: PhotographerToolPack | null | undefined;
  beepOnTransit: boolean;
  onToggleBeep: () => void;
};

export function PhotographerToolsPanel({
  selectedFlightId,
  photoPack,
  beepOnTransit,
  onToggleBeep,
}: PhotographerToolsPanelProps) {
  return (
    <div className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-emerald-900/50 bg-zinc-900/50 p-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-emerald-500/80">
        Photographer — tools
      </h2>
      <p className="mt-1 text-[0.65rem] leading-relaxed text-zinc-500">
        Select an aircraft from the list (candidate or active). Moon: simulated
        time from the slider. Flight is extrapolated 30 s along track; OpenSky:
        real speed / track.
      </p>
      {selectedFlightId == null && (
        <p className="mt-2 text-sm text-zinc-500">No flight selected.</p>
      )}
      {selectedFlightId && !photoPack && (
        <p className="mt-2 text-sm text-amber-300/80">
          This aircraft is missing speed/track/altitude for the calculation.
        </p>
      )}
      {photoPack && (
        <div className="mt-3 space-y-3">
          <div
            className="rounded-lg border border-emerald-800/50 bg-zinc-950/80 py-3 text-center"
            aria-live="polite"
          >
            <p className="text-[0.6rem] uppercase tracking-wider text-zinc-500">
              To moon ray (obs. azimuth, linear model)
            </p>
            <p className="mt-0.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-emerald-300">
              {formatCountdown(photoPack.timeToAlignmentSec ?? null)}
            </p>
          </div>
          <dl className="min-w-0 space-y-0.5 break-words font-mono text-[0.7rem] tabular-nums text-zinc-400">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <dt className="shrink-0">ω (aircraft azimuth, |·|)</dt>
              <dd>
                {formatFixed(photoPack.kin.absAzimuthRateDegPerSec, 3)}°/s
              </dd>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
              <dt className="shrink-0">Slant range</dt>
              <dd>{formatFixed(photoPack.kin.slantRangeMeters / 1000, 2)} km</dd>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
              <dt className="shrink-0">Transit duration (moon + wing)</dt>
              <dd>
                {photoPack.transitDurationMs != null
                  ? `${(photoPack.transitDurationMs / 1000).toFixed(2)} s`
                  : "—"}
              </dd>
            </div>
          </dl>
          <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
            <span className="text-xs text-zinc-500">Sound on transit</span>
            <button
              type="button"
              onClick={onToggleBeep}
              className={`rounded px-2.5 py-1 text-xs ${
                beepOnTransit
                  ? "bg-emerald-800/50 text-emerald-100"
                  : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {beepOnTransit ? "Beep on" : "Beep off"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
