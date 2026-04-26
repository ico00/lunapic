"use client";

import { usePhotographerTools } from "@/hooks/usePhotographerTools";
import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import {
  type FieldPlanSnapshot,
  buildFieldPlanText,
  createFieldPlanPngDataUrl,
  downloadPngDataUrl,
  downloadTextFile,
} from "@/lib/field/fieldPlanExport";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useCallback, useMemo, useState } from "react";

function num(n: number, d = 2): string {
  return n.toFixed(d);
}

export function FieldOverlaysSection() {
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const addSkew = useMoonTransitStore((s) => s.addOpenSkyLatencySkewMs);
  const setSkew = useMoonTransitStore((s) => s.setOpenSkyLatencySkewMs);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const timeOffsetMs = useMoonTransitStore((s) => s.timeOffsetMs);
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const flights = useMoonTransitStore((s) => s.flights);
  const obs = useObserverStore((s) => s.observer);
  const locked = useObserverStore((s) => s.observerLocationLocked);
  const setLocked = useObserverStore((s) => s.setObserverLocationLocked);
  const moon = useMoonStateComputed();
  const { pack } = usePhotographerTools();
  const [exportBusy, setExportBusy] = useState(false);
  const skewSec = latencySkewMs / 1000;

  const planSnapshot: FieldPlanSnapshot = useMemo(() => {
    const sel = flights.find((f) => f.id === selectedFlightId) ?? null;
    return {
      referenceEpochMs,
      timeOffsetMs,
      latencySkewMs,
      selectedFlightId,
      flightCallSign: sel?.callSign ?? null,
      flightId: sel?.id ?? null,
      obsLat: obs.lat,
      obsLng: obs.lng,
      obsH: obs.groundHeightMeters,
      moonAz: moon.azimuthDeg,
      moonAlt: moon.altitudeDeg,
      moonR: moon.apparentRadius.degrees,
      photoSummary: {
        toImpactSec: pack?.timeToAlignmentSec ?? null,
        transitMs: pack?.transitDurationMs ?? null,
        omegaDps: pack?.kin.absAzimuthRateDegPerSec ?? null,
      },
    };
  }, [
    referenceEpochMs,
    timeOffsetMs,
    latencySkewMs,
    selectedFlightId,
    flights,
    obs,
    moon,
    pack,
  ]);

  const onExportText = useCallback(() => {
    downloadTextFile("moontransit-plan.txt", buildFieldPlanText(planSnapshot));
  }, [planSnapshot]);

  const onExportPng = useCallback(() => {
    setExportBusy(true);
    try {
      const url = createFieldPlanPngDataUrl(planSnapshot, 2);
      if (url) {
        downloadPngDataUrl("moontransit-plan.png", url);
      }
    } finally {
      setExportBusy(false);
    }
  }, [planSnapshot]);

  return (
    <div className="relative z-0 mt-0 min-w-0 space-y-3 overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-950/40 p-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Field: manual correction & export
      </h2>
      <div>
        <p className="text-[0.65rem] text-zinc-500">
          Fine-tune for OpenSky latency: offset from “now” for track
          extrapolation (does not change the Moon from the time slider).
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => {
              addSkew(-1_000);
            }}
            className="shrink-0 rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200"
          >
            −1 s
          </button>
          <input
            type="range"
            min={-30}
            max={30}
            step={0.5}
            value={skewSec}
            onChange={(e) => {
              setSkew(parseFloat(e.target.value) * 1_000);
            }}
            className="h-1.5 w-full min-w-0 flex-1 accent-amber-500"
            aria-label="Aircraft time offset in seconds"
          />
          <button
            type="button"
            onClick={() => {
              addSkew(1_000);
            }}
            className="shrink-0 rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200"
          >
            +1 s
          </button>
        </div>
        <p className="mt-1 text-center font-mono text-sm text-amber-200/80">
          {skewSec >= 0 ? "+" : ""}
          {num(skewSec, 1)} s
        </p>
        <button
          type="button"
          onClick={() => {
            setSkew(0);
          }}
          className="mt-1 w-full rounded border border-zinc-700 py-0.5 text-[0.65rem] text-zinc-500"
        >
          Reset
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
        <div>
          <p className="text-[0.65rem] font-medium text-zinc-400">
            Lock location
          </p>
          <p className="text-[0.6rem] text-zinc-600">
            GPS and “set here” are off while this is on.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLocked(!locked);
          }}
          className={`rounded px-3 py-1.5 text-sm ${
            locked
              ? "bg-amber-800/50 text-amber-100"
              : "bg-zinc-800 text-zinc-300"
          }`}
        >
          {locked ? "Unlock" : "Lock"}
        </button>
      </div>
      <div className="border-t border-zinc-800/80 pt-2">
        <p className="text-[0.65rem] text-zinc-500">Export plan</p>
        <div className="mt-1 flex flex-col gap-1.5 sm:flex-row">
          <button
            type="button"
            onClick={onExportText}
            className="flex-1 rounded border border-sky-800/50 bg-sky-950/30 py-1.5 text-sm text-sky-100/90"
          >
            Cheat sheet (.txt)
          </button>
          <button
            type="button"
            onClick={onExportPng}
            disabled={exportBusy}
            className="flex-1 rounded border border-violet-800/50 bg-violet-950/30 py-1.5 text-sm text-violet-100/90 disabled:opacity-50"
          >
            {exportBusy ? "…" : "Snapshot (.png)"}
          </button>
        </div>
      </div>
    </div>
  );
}
