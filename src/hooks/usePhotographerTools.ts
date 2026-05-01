import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import { isMoonVisibleFromMoonState } from "@/lib/domain/astro/moonVisibility";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import {
  evaluateShotFeasibility,
  type ShotFeasibility,
} from "@/lib/domain/geometry/shotFeasibility";
import { playShortBeep } from "@/lib/audio/fieldAudio";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useEffect, useMemo, useRef, useState } from "react";

export type PhotographerToolPack = NonNullable<
  ReturnType<typeof GeometryEngine.photographerPack>
>;
export type PhotographerShotFeasibility = ShotFeasibility;
export type PhotographerToolsUnavailableReason =
  | "noSelection"
  | "moonBelowHorizon"
  | "flightNotFound"
  | "missingInputs";

export function formatCountdown(totalSec: number | null): string {
  if (totalSec == null || !Number.isFinite(totalSec)) {
    return "—";
  }
  if (totalSec < 0) {
    return "0.0";
  }
  if (totalSec >= 99 * 60) {
    return "—";
  }
  const t = totalSec;
  if (t >= 60) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
  }
  return `${t.toFixed(1)} s`;
}

export function usePhotographerTools() {
  const observer = useObserverStore((s) => s.observer);
  const selectedId = useMoonTransitStore((s) => s.selectedFlightId);
  const flights = useMoonTransitStore((s) => s.flights);
  const refEpoch = useMoonTransitStore((s) => s.referenceEpochMs);
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const cameraFocalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const cameraSensorType = useMoonTransitStore((s) => s.cameraSensorType);
  const moon = useMoonStateComputed();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => {
      clearInterval(id);
    };
  }, []);

  const at = useMemo(
    () => new Date(refEpoch),
    [refEpoch]
  );

  const result = useMemo(() => {
    if (!selectedId) {
      return {
        pack: null,
        shot: null,
        reason: "noSelection" as const,
      };
    }
    if (!isMoonVisibleFromMoonState(moon)) {
      return {
        pack: null,
        shot: null,
        reason: "moonBelowHorizon" as const,
      };
    }
    const raw = flights.find((x) => x.id === selectedId) ?? null;
    if (!raw) {
      return {
        pack: null,
        shot: null,
        reason: "flightNotFound" as const,
      };
    }
    const flight = extrapolateFlightForDisplay(raw, now, latencySkewMs);
    const pack = GeometryEngine.photographerPack(observer, flight, moon, at, {});
    const shot = evaluateShotFeasibility(observer, flight, {
      focalLengthMm: cameraFocalLengthMm,
      sensorType: cameraSensorType,
    });
    if (!pack) {
      return {
        pack: null,
        shot,
        reason: "missingInputs" as const,
      };
    }
    return {
      pack,
      shot,
      reason: null,
    };
  }, [
    at,
    cameraFocalLengthMm,
    cameraSensorType,
    flights,
    latencySkewMs,
    moon,
    now,
    observer,
    selectedId,
  ]);
  return { ...result, now };
}

/**
 * 3 s prije točke poravnanja i točno u trenutku (kada |t| mali nakon 0).
 */
export function useTransitBeep(
  timeToAlignmentSec: number | null,
  beepOn: boolean
) {
  const preRef = useRef(false);
  const hitRef = useRef(false);
  const lastSel = useRef<string | null | undefined>(undefined);
  const selectedId = useMoonTransitStore((s) => s.selectedFlightId);
  useEffect(() => {
    if (lastSel.current === undefined) {
      lastSel.current = selectedId;
      return;
    }
    if (lastSel.current !== selectedId) {
      preRef.current = false;
      hitRef.current = false;
      lastSel.current = selectedId;
    }
  }, [selectedId]);
  useEffect(() => {
    if (!beepOn) {
      return;
    }
    if (timeToAlignmentSec == null || !Number.isFinite(timeToAlignmentSec)) {
      return;
    }
    const t = timeToAlignmentSec;
    if (t < 0.1 && t > -0.25 && !hitRef.current) {
      playShortBeep(990, 0.09, 0.1);
      hitRef.current = true;
      return;
    }
    if (t > 0 && t <= 3.2 && t >= 2.6 && !preRef.current) {
      playShortBeep(660, 0.09, 0.1);
      preRef.current = true;
    }
  }, [beepOn, timeToAlignmentSec]);
}
