import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconCamera } from "@/components/shell/sectionCategoryIcons";
import {
  formatCountdown,
  type PhotographerShotFeasibility,
  type PhotographerToolPack,
  type PhotographerToolsUnavailableReason,
} from "@/hooks/usePhotographerTools";
import { formatFixed } from "@/lib/format/numbers";

type PhotographerToolsPanelProps = {
  selectedFlightId: string | null;
  photoPack: PhotographerToolPack | null | undefined;
  photoShotFeasibility: PhotographerShotFeasibility | null | undefined;
  photoUnavailableReason: PhotographerToolsUnavailableReason | null | undefined;
  beepOnTransit: boolean;
  onToggleBeep: () => void;
};

function reasonText(
  reason: PhotographerToolsUnavailableReason | null | undefined
): string {
  if (reason === "moonBelowHorizon") {
    return "Moon is below horizon at the current simulated time.";
  }
  if (reason === "flightNotFound") {
    return "Selected aircraft is no longer in the current flight snapshot.";
  }
  if (reason === "missingInputs") {
    return "This aircraft is missing speed/track/altitude for the calculation.";
  }
  return "Calculation is currently unavailable.";
}

export function PhotographerToolsPanel({
  selectedFlightId,
  photoPack,
  photoShotFeasibility,
  photoUnavailableReason,
  beepOnTransit,
  onToggleBeep,
}: PhotographerToolsPanelProps) {
  const shotTier = photoShotFeasibility?.tier ?? null;
  const shotBadgeClass =
    shotTier === "excellent"
      ? "bg-emerald-800/40 text-emerald-100 border-emerald-600/40"
      : shotTier === "fair"
        ? "bg-amber-800/35 text-amber-100 border-amber-600/40"
        : "bg-rose-900/35 text-rose-100 border-rose-700/40";
  const shotLabel =
    shotTier === "excellent"
      ? "EXCELLENT"
      : shotTier === "fair"
        ? "FAIR"
        : "POOR";
  return (
    <ShellSectionCard
      title="Photographer — tools"
      accent="emerald"
      titleTone="emerald"
      icon={<SectionIconCamera />}
    >
      <p className="text-[0.65rem] leading-relaxed text-zinc-500">
        Pick a flight from the list or map. Times use the{" "}
        <strong className="font-medium text-zinc-400">slider time</strong> for
        the moon and a short forward guess for the plane (speed + heading from
        the flight feed).
      </p>
      {selectedFlightId == null && (
        <p className="mt-2 text-sm text-zinc-500">No flight selected.</p>
      )}
      {selectedFlightId && !photoPack && (
        <p className="mt-2 text-sm text-amber-300/80">
          {reasonText(photoUnavailableReason)}
        </p>
      )}
      {photoPack && (
        <div className="mt-3 space-y-3">
          <div
            className="rounded-xl border border-emerald-800/50 bg-zinc-950/80 px-2 py-3 text-center"
            aria-live="polite"
          >
            <p className="text-xs font-medium leading-snug text-zinc-200">
              Time until moon and plane line up
            </p>
            <p className="mt-3 font-mono text-3xl font-semibold tabular-nums tracking-tight text-emerald-300">
              {formatCountdown(photoPack.timeToAlignmentSec ?? null)}
            </p>
          </div>
          <dl className="min-w-0 space-y-0.5 break-words font-mono text-[0.7rem] tabular-nums text-zinc-400">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <dt className="max-w-[58%] shrink-0 text-[0.65rem] font-sans font-normal normal-case text-zinc-500">
                How fast your aim swings (°/s)
              </dt>
              <dd>
                {formatFixed(photoPack.kin.absAzimuthRateDegPerSec, 3)}°/s
              </dd>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
              <dt className="max-w-[58%] shrink-0 text-[0.65rem] font-sans font-normal normal-case text-zinc-500">
                Straight-line distance to plane
              </dt>
              <dd>{formatFixed(photoPack.kin.slantRangeMeters / 1000, 2)} km</dd>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
              <dt className="max-w-[58%] shrink-0 text-[0.65rem] font-sans font-normal normal-case text-zinc-500">
                Moon-on-disk crossing (rough)
              </dt>
              <dd>
                {photoPack.transitDurationMs != null
                  ? `${(photoPack.transitDurationMs / 1000).toFixed(2)} s`
                  : "—"}
              </dd>
            </div>
          </dl>
          {photoShotFeasibility ? (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.65rem] uppercase tracking-wide text-zinc-500">
                  Shot feasibility
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 font-mono text-[0.62rem] tracking-wide ${shotBadgeClass}`}
                >
                  {shotLabel}
                </span>
              </div>
              <p className="mt-1.5 text-[0.7rem] leading-relaxed text-zinc-300">
                At {formatFixed(photoShotFeasibility.effectiveFocalLengthMm, 0)} mm
                focal length, plane will be{" "}
                {formatFixed(photoShotFeasibility.moonCoveragePercent, 1)}% of moon
                diameter.
              </p>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
            <span className="text-xs text-zinc-500">Sound on transit</span>
            <button
              type="button"
              onClick={onToggleBeep}
              className={`rounded-lg px-2.5 py-1 text-xs ${
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
    </ShellSectionCard>
  );
}
