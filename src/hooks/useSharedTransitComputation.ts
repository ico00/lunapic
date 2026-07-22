import { AstroService } from "@/lib/domain/astro/astroService";
import {
  computeActiveTransits,
  DEFAULT_ACTIVE_TRANSIT_TOL_DEG,
} from "@/lib/domain/transit/computeActiveTransits";
import { computeTransitCandidates } from "@/lib/domain/transit/computeTransitCandidates";
import { useWallNowMs } from "@/hooks/useWallNowMs";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useTransitComputedStore } from "@/stores/transit-computed-store";
import { useLayoutEffect, useMemo } from "react";

/**
 * Jedini tick + izračun Mjeseca / transit kandidata / active transits za cijelu
 * aplikaciju. Mount **jednom** (u `HomePageClient`) — pojedinačne komponente
 * čitaju rezultat kroz selektore na `useTransitComputedStore`
 * (`useMoonStateComputed`, `useTransitCandidates`, `useActiveTransits`)
 * umjesto da svaka pokreće vlastiti `useWallNowMs` + `useMemo`.
 */
export function useSharedTransitComputation(): void {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const openSkyLatencySkewMs = useMoonTransitStore(
    (s) => s.openSkyLatencySkewMs
  );
  const flights = useMoonTransitStore((s) => s.flights);
  const focalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const sensorType = useMoonTransitStore((s) => s.cameraSensorType);
  const timeAnchorIsPlanned = useMoonTransitStore(
    (s) => s.timeAnchorIsPlanned
  );
  const wallNowMs = useWallNowMs();

  const computed = useMemo(() => {
    const moon = AstroService.getMoonState(
      new Date(referenceEpochMs > 0 ? referenceEpochMs : wallNowMs),
      observer.lat,
      observer.lng,
      observer.groundHeightMeters
    );
    if (timeAnchorIsPlanned) {
      return { moon, candidates: [], activeTransits: [] };
    }
    const candidates = computeTransitCandidates({
      observer,
      focalLengthMm,
      sensorType,
      flights,
      at: new Date(referenceEpochMs),
      wallNowMs,
      latencySkewMs: openSkyLatencySkewMs,
    });
    const activeTransits = computeActiveTransits({
      observer,
      flights,
      at: new Date(referenceEpochMs),
      wallNowMs,
      latencySkewMs: openSkyLatencySkewMs,
      toleranceDeg: DEFAULT_ACTIVE_TRANSIT_TOL_DEG,
    });
    return { moon, candidates, activeTransits };
  }, [
    observer,
    referenceEpochMs,
    openSkyLatencySkewMs,
    flights,
    focalLengthMm,
    sensorType,
    timeAnchorIsPlanned,
    wallNowMs,
  ]);

  useLayoutEffect(() => {
    useTransitComputedStore.setState(computed);
  }, [computed]);
}
