import { computeTransitSnapshot } from "@/lib/domain/transit/computeTransitSnapshot";
import { useWallNowMs } from "@/hooks/useWallNowMs";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useTransitComputedStore } from "@/stores/transit-computed-store";
import { useLayoutEffect, useMemo } from "react";

/**
 * Jedini tick + izračun Mjeseca / transit kandidata / active transits / skupova
 * letova za kartu za cijelu aplikaciju. Mount **jednom** (u `HomePageClient`) —
 * pojedinačne komponente čitaju rezultat kroz selektore na
 * `useTransitComputedStore` (`useMoonStateComputed`, `useLiveMoonState`,
 * `useTransitCandidates`, `useActiveTransits`) umjesto da svaka pokreće vlastiti
 * `useWallNowMs` + `useMemo`.
 */
export function useSharedTransitComputation(): void {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const flights = useMoonTransitStore((s) => s.flights);
  const focalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const sensorType = useMoonTransitStore((s) => s.cameraSensorType);
  const isPlanned = useMoonTransitStore((s) => s.timeAnchorIsPlanned);
  const wallNowMs = useWallNowMs();

  const computed = useMemo(
    () =>
      computeTransitSnapshot({
        observer,
        focalLengthMm,
        sensorType,
        flights,
        referenceEpochMs,
        wallNowMs,
        latencySkewMs,
        isPlanned,
      }),
    [
      observer,
      focalLengthMm,
      sensorType,
      flights,
      referenceEpochMs,
      wallNowMs,
      latencySkewMs,
      isPlanned,
    ]
  );

  useLayoutEffect(() => {
    useTransitComputedStore.setState(computed);
  }, [computed]);
}
