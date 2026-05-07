"use client";

import { CameraSensorSelect } from "@/components/shell/CameraSensorSelect";
import { CameraPresetSelect } from "@/components/shell/CameraPresetSelect";
import { ViewfinderPreview } from "@/components/field/ViewfinderPreview";
import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconCamera } from "@/components/shell/sectionCategoryIcons";
import {
  formatCountdown,
  type PhotographerShotFeasibility,
  type PhotographerToolPack,
  type PhotographerToolsUnavailableReason,
} from "@/hooks/usePhotographerTools";
import {
  CAMERA_SENSOR_CROP,
  moonDiameterPxOnOutputFrame,
  moonFrameFillForOutputFrame,
} from "@/lib/domain/geometry/shotFeasibility";
import { primeFieldAudioFromUserGesture } from "@/lib/audio/fieldAudio";
import { getCameraPresetById } from "@/lib/camera/cameraPresets";
import { formatFixed } from "@/lib/format/numbers";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useCallback, useState } from "react";

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
  const cameraFocalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const cameraSensorType = useMoonTransitStore((s) => s.cameraSensorType);
  const cameraPresetId = useMoonTransitStore((s) => s.cameraPresetId);
  const cameraFrameWidthPx = useMoonTransitStore(
    (s) => s.cameraFrameWidthPx
  );
  const cameraFrameHeightPx = useMoonTransitStore(
    (s) => s.cameraFrameHeightPx
  );
  const setCameraFocalLengthMm = useMoonTransitStore(
    (s) => s.setCameraFocalLengthMm
  );
  const setCameraSensorType = useMoonTransitStore((s) => s.setCameraSensorType);
  const setCameraPresetId = useMoonTransitStore((s) => s.setCameraPresetId);
  const setCameraFrameWidthPx = useMoonTransitStore(
    (s) => s.setCameraFrameWidthPx
  );
  const setCameraFrameHeightPx = useMoonTransitStore(
    (s) => s.setCameraFrameHeightPx
  );
  const flights = useMoonTransitStore((s) => s.flights);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const observer = useObserverStore((s) => s.observer);
  /**
   * While focused, hold a draft string; when null, the input shows the store value
   * directly so external focal-length changes sync without a setState-in-effect.
   */
  const [focalDraft, setFocalDraft] = useState<string | null>(null);
  const [frameWidthDraft, setFrameWidthDraft] = useState<string | null>(
    null
  );
  const [frameHeightDraft, setFrameHeightDraft] = useState<string | null>(
    null
  );
  const focalInputValue = focalDraft ?? String(cameraFocalLengthMm);
  const frameWidthInputValue =
    frameWidthDraft ?? String(cameraFrameWidthPx);
  const frameHeightInputValue =
    frameHeightDraft ?? String(cameraFrameHeightPx);
  const effectiveFocalMm =
    cameraFocalLengthMm * CAMERA_SENSOR_CROP[cameraSensorType];
  const cameraPreset = getCameraPresetById(cameraPresetId);
  const isManualCameraPreset = cameraPreset.kind === "manual";

  const handleCameraPresetChange = useCallback(
    (presetId: string) => {
      setFrameWidthDraft(null);
      setFrameHeightDraft(null);
      setCameraPresetId(presetId);
    },
    [setCameraPresetId]
  );

  const commitFocalLengthFromInput = useCallback(() => {
    const raw = focalInputValue.trim().replace(",", ".");
    if (raw === "") {
      setFocalDraft(null);
      return;
    }
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      setFocalDraft(null);
      return;
    }
    setCameraFocalLengthMm(n);
    setFocalDraft(null);
  }, [focalInputValue, setCameraFocalLengthMm]);

  const commitFrameWidthFromInput = useCallback(() => {
    const raw = frameWidthInputValue.trim();
    if (raw === "") {
      setFrameWidthDraft(null);
      return;
    }
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      setFrameWidthDraft(null);
      return;
    }
    setCameraFrameWidthPx(n);
    setFrameWidthDraft(null);
  }, [frameWidthInputValue, setCameraFrameWidthPx]);

  const commitFrameHeightFromInput = useCallback(() => {
    const raw = frameHeightInputValue.trim();
    if (raw === "") {
      setFrameHeightDraft(null);
      return;
    }
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      setFrameHeightDraft(null);
      return;
    }
    setCameraFrameHeightPx(n);
    setFrameHeightDraft(null);
  }, [frameHeightInputValue, setCameraFrameHeightPx]);

  const moonOnCurrentFramePx =
    photoShotFeasibility != null
      ? moonDiameterPxOnOutputFrame(
          photoShotFeasibility.moonDiameterPxAtReferenceSensor,
          cameraFrameWidthPx
        )
      : null;
  const moonFillCurrentFrame =
    moonOnCurrentFramePx != null &&
    moonOnCurrentFramePx > 0 &&
    cameraFrameWidthPx > 0 &&
    cameraFrameHeightPx > 0
      ? moonFrameFillForOutputFrame({
          moonDiameterPxOnFrame: moonOnCurrentFramePx,
          frameWidthPx: cameraFrameWidthPx,
          frameHeightPx: cameraFrameHeightPx,
        })
      : null;

  const shotTier = photoShotFeasibility?.tier ?? null;
  const shotBadgeClass =
    shotTier === "excellent"
      ? "bg-blue-500/15 text-blue-200 border-blue-500/40"
      : shotTier === "fair"
        ? "bg-zinc-800/80 text-yellow-400 border-zinc-600"
        : "bg-zinc-900 text-zinc-400 border-zinc-700";
  const shotLabel =
    shotTier === "excellent"
      ? "EXCELLENT"
      : shotTier === "fair"
        ? "FAIR"
        : "POOR";
  const selectedFlight =
    selectedFlightId == null
      ? null
      : flights.find((flight) => flight.id === selectedFlightId) ?? null;
  return (
    <ShellSectionCard
      title="Photographer — tools"
      accent="emerald"
      titleTone="emerald"
      icon={<SectionIconCamera />}
    >
      <div>
        <p className="text-[0.65rem] text-zinc-500">Camera settings</p>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex min-h-0 min-w-0 flex-col gap-1 sm:col-span-2">
            <span className="text-[0.62rem] uppercase tracking-wide text-zinc-500">
              Camera preset
            </span>
            <div className="min-w-0">
              <CameraPresetSelect
                value={cameraPresetId}
                onChange={handleCameraPresetChange}
              />
            </div>
          </label>
          <label className="flex min-h-0 min-w-0 flex-col gap-1">
            <span className="text-[0.62rem] uppercase tracking-wide text-zinc-500">
              Focal length (mm)
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              aria-label="Focal length in millimeters"
              placeholder="50–2400"
              value={focalInputValue}
              onFocus={() => {
                setFocalDraft(String(cameraFocalLengthMm));
              }}
              onChange={(e) => {
                setFocalDraft(e.target.value);
              }}
              onBlur={commitFocalLengthFromInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="box-border h-9 w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-2 font-mono text-sm leading-none text-zinc-100"
            />
          </label>
          <label className="flex min-h-0 min-w-0 flex-col gap-1">
            <span className="text-[0.62rem] uppercase tracking-wide text-zinc-500">
              Sensor type
            </span>
            <div className="min-w-0">
              <CameraSensorSelect
                value={cameraSensorType}
                onChange={setCameraSensorType}
                disabled={!isManualCameraPreset}
              />
            </div>
          </label>
          <label className="flex min-h-0 min-w-0 flex-col gap-1">
            <span className="text-[0.62rem] uppercase tracking-wide text-zinc-500">
              Frame width (px)
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              aria-label="Output frame width in pixels"
              placeholder="128–16384"
              disabled={!isManualCameraPreset}
              value={frameWidthInputValue}
              onFocus={() => {
                setFrameWidthDraft(String(cameraFrameWidthPx));
              }}
              onChange={(e) => {
                setFrameWidthDraft(e.target.value);
              }}
              onBlur={commitFrameWidthFromInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="box-border h-9 w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-2 font-mono text-sm leading-none text-zinc-100 disabled:cursor-not-allowed disabled:opacity-55"
            />
          </label>
          <label className="flex min-h-0 min-w-0 flex-col gap-1">
            <span className="text-[0.62rem] uppercase tracking-wide text-zinc-500">
              Frame height (px)
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              aria-label="Output frame height in pixels"
              placeholder="128–16384"
              disabled={!isManualCameraPreset}
              value={frameHeightInputValue}
              onFocus={() => {
                setFrameHeightDraft(String(cameraFrameHeightPx));
              }}
              onChange={(e) => {
                setFrameHeightDraft(e.target.value);
              }}
              onBlur={commitFrameHeightFromInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="box-border h-9 w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-2 font-mono text-sm leading-none text-zinc-100 disabled:cursor-not-allowed disabled:opacity-55"
            />
          </label>
        </div>
        <p className="mt-1 font-mono text-[0.65rem] text-zinc-500">
          Effective focal length: {formatFixed(effectiveFocalMm, 0)} mm
        </p>
        <p className="mt-0.5 font-mono text-[0.65rem] text-zinc-500">
          Output frame (active):{" "}
          {cameraFrameWidthPx}×{cameraFrameHeightPx} px
        </p>
      </div>
      {selectedFlightId == null && (
        <p className="mt-3 border-t border-zinc-800/80 pt-3 text-sm text-zinc-500">
          No flight selected.
        </p>
      )}
      {selectedFlightId && !photoPack && (
        <p className="mt-3 border-t border-zinc-800/80 pt-3 text-sm text-yellow-600/90">
          {reasonText(photoUnavailableReason)}
        </p>
      )}
      {selectedFlightId ? (
        <div className="mt-3 space-y-2 border-t border-zinc-800/80 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">Field sounds</span>
            <button
              type="button"
              data-testid="field-sounds-toggle"
              onClick={() => {
                if (!beepOnTransit) {
                  primeFieldAudioFromUserGesture();
                }
                onToggleBeep();
              }}
              className={`rounded-lg px-2.5 py-1 text-xs ${
                beepOnTransit
                  ? "bg-blue-500/20 text-yellow-400"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {beepOnTransit ? "Sounds on" : "Sounds off"}
            </button>
          </div>
        </div>
      ) : null}
      {photoPack && (
        <div className="mt-3 space-y-3 pt-3">
          <div
            className="rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-3 text-center"
            aria-live="polite"
          >
            <p className="text-xs font-medium leading-snug text-zinc-200">
              Time until moon and plane line up
            </p>
            <p className="mt-3 font-mono text-3xl font-semibold tabular-nums tracking-tight text-yellow-400">
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
                Plane is{" "}
                {formatFixed(photoShotFeasibility.moonCoveragePercent, 1)}% of moon
                diameter at current distance (geometry ratio, independent of focal length).
              </p>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-zinc-400">
                At effective{" "}
                {formatFixed(photoShotFeasibility.effectiveFocalLengthMm, 0)} mm, full Moon is about{" "}
                {moonOnCurrentFramePx != null
                  ? `${formatFixed(moonOnCurrentFramePx, 0)} px`
                  : "—"}
                {" "}
                on a {cameraFrameWidthPx}×{cameraFrameHeightPx} frame
                {moonFillCurrentFrame ? (
                  <>
                    {" "}
                    (~
                    {formatFixed(moonFillCurrentFrame.widthPercent, 1)}%
                    width, ~
                    {formatFixed(moonFillCurrentFrame.areaPercent, 1)}% area)
                  </>
                ) : (
                  ""
                )}
                .
              </p>
            </div>
          ) : null}
          <ViewfinderPreview
            className="pt-1"
            simulatedEpochMs={referenceEpochMs}
            angularSizeDeg={photoShotFeasibility?.angularSizeDeg ?? null}
            distanceToObserverMeters={
              photoShotFeasibility?.slantRangeMeters ?? photoPack.kin.slantRangeMeters
            }
            aircraftLengthMeters={selectedFlight?.wingspanMeters ?? null}
            moonDiameterPxAtReferenceSensor={
              photoShotFeasibility?.moonDiameterPxAtReferenceSensor ?? null
            }
            cameraFrameWidthPx={cameraFrameWidthPx}
            cameraFrameHeightPx={cameraFrameHeightPx}
            aircraftAltitudeMeters={
              selectedFlight?.geoAltitudeMeters ?? selectedFlight?.baroAltitudeMeters ?? null
            }
            aircraftHeadingDeg={selectedFlight?.trackDeg ?? null}
            aircraftGroundSpeedMps={selectedFlight?.groundSpeedMps ?? null}
            aircraftIcao24={selectedFlight?.icao24 ?? selectedFlight?.id ?? null}
            observerLat={observer.lat}
            observerLng={observer.lng}
            callSign={selectedFlight?.callSign ?? selectedFlight?.id ?? null}
          />
        </div>
      )}
    </ShellSectionCard>
  );
}
