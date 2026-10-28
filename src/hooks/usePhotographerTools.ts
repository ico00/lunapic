import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import { isMoonVisibleFromMoonState } from "@/lib/domain/astro/moonVisibility";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import {
  flightFixAgeMs,
  isFlightFixStale,
} from "@/lib/flight/flightFixFreshness";
import {
  evaluateShotFeasibility,
  type ShotFeasibility,
} from "@/lib/domain/geometry/shotFeasibility";
import { playCountdownNumberBeep, playShortBeep } from "@/lib/audio/fieldAudio";
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
  | "missingInputs"
  | "staleFix"
  | "planningMode";

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
  const timeAnchorIsPlanned = useMoonTransitStore((s) => s.timeAnchorIsPlanned);
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

  // Pack computation runs every 100 ms (driven by `now`).
  // Previously this caused 20 getMoonState calls/s and froze the main thread.
  // Now getMoonState is cached (10 s buckets in astroService), so each 100 ms tick
  // costs ~0.2 ms instead of ~10 ms — cheap enough to keep `now` in deps.
  //
  // Keeping `now` (= real wall clock) for flight extrapolation is REQUIRED for
  // cross-device synchronisation: refEpoch drifts independently on each device
  // (tickLiveTime fires at different absolute times), so using at.getTime() would
  // give different countdowns on mobile vs desktop for the same flight.
  const result = useMemo(() => {
    // Planning mode: countdown i feasibility rade nad ŽIVIM letovima — za
    // budući datum su besmisleni, pa se alat gasi s objašnjenjem.
    if (timeAnchorIsPlanned) {
      return { pack: null, shot: null, reason: "planningMode" as const };
    }
    if (!selectedId) {
      return { pack: null, shot: null, reason: "noSelection" as const };
    }
    if (!isMoonVisibleFromMoonState(moon)) {
      return { pack: null, shot: null, reason: "moonBelowHorizon" as const };
    }
    const raw = flights.find((x) => x.id === selectedId) ?? null;
    if (!raw) {
      return { pack: null, shot: null, reason: "flightNotFound" as const };
    }
    // Fix stariji od praga: marker već stoji, pa bi odbrojavanje bilo izmišljeno.
    // Radije reci koliko je star nego pokazati broj u koji se ne može gledati.
    if (isFlightFixStale(raw, now, latencySkewMs)) {
      return {
        pack: null,
        shot: null,
        reason: "staleFix" as const,
        fixAgeSec: Math.round(flightFixAgeMs(raw, now, latencySkewMs) / 1000),
      };
    }
    const flight = extrapolateFlightForDisplay(raw, now, latencySkewMs);
    const pack = GeometryEngine.photographerPack(observer, flight, moon, at, {
      airlinerLengthMeters: flight.lengthMeters ?? undefined,
    });
    const shot = evaluateShotFeasibility(observer, flight, {
      focalLengthMm: cameraFocalLengthMm,
      sensorType: cameraSensorType,
    });
    if (!pack) {
      return { pack: null, shot, reason: "missingInputs" as const };
    }
    return { pack, shot, reason: null as null };
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
    timeAnchorIsPlanned,
  ]);

  return { ...result, now };
}

const COUNTDOWN_NUMBERS = [5, 4, 3, 2, 1] as const;

/**
 * Odbrojavanje 5-4-3-2-1 (sintetizirani beep po broju, rastuća visina) i
 * točno u trenutku poravnanja (kada |t| mali nakon 0). Svaki broj se okida
 * kad live `timeToAlignmentSec` prijeđe njegov prag — pošto ta procjena NIJE
 * linearna u stvarnom vremenu (ubrzava kako se avion približava), beep-ovi
 * time stvarno prate procjenu umjesto da glume fiksni sat; brojevi se
 * preskoče (ne repliciraju) ako `t` padne preko više pragova u jednom ticku.
 */
export function useTransitBeep(
  timeToAlignmentSec: number | null,
  beepOn: boolean
) {
  const playedRef = useRef<Set<number>>(new Set());
  const hitRef = useRef(false);
  const lastSel = useRef<string | null | undefined>(undefined);
  const selectedId = useMoonTransitStore((s) => s.selectedFlightId);
  useEffect(() => {
    if (lastSel.current === undefined) {
      lastSel.current = selectedId;
      return;
    }
    if (lastSel.current !== selectedId) {
      playedRef.current.clear();
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
    for (const n of COUNTDOWN_NUMBERS) {
      if (t <= n + 0.3 && t >= n - 0.3 && !playedRef.current.has(n)) {
        playCountdownNumberBeep(n);
        playedRef.current.add(n);
        break;
      }
    }
  }, [beepOn, timeToAlignmentSec]);
}
