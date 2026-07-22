import { AstroService } from "@/lib/domain/astro/astroService";
import { computeTransitCandidates } from "@/lib/domain/transit/computeTransitCandidates";
import { useWallNowMs } from "@/hooks/useWallNowMs";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useMemo } from "react";

/**
 * Domena: trenutni Mjesec + zrakoplovi u storeu → kandidati za tranzit
 * i "in frame" kandidati, enrichani s photographerPack podacima.
 *
 * Sva logika je u `computeTransitCandidates` (dijeli se sa server-side
 * `/api/transit/scan` rutom) — ovaj hook je samo store-bound wrapper.
 */
export function useTransitCandidates() {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const openSkyLatencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const flights = useMoonTransitStore((s) => s.flights);
  const focalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const sensorType = useMoonTransitStore((s) => s.cameraSensorType);
  const timeAnchorIsPlanned = useMoonTransitStore((s) => s.timeAnchorIsPlanned);
  const wallNowMs = useWallNowMs();
  return useMemo(() => {
    // Planning mode: budući Mjesec + današnji živi letovi nemaju smisla zajedno.
    if (timeAnchorIsPlanned) {
      return [];
    }
    return computeTransitCandidates({
      observer,
      focalLengthMm,
      sensorType,
      flights,
      at: new Date(referenceEpochMs),
      wallNowMs,
      latencySkewMs: openSkyLatencySkewMs,
    });
  }, [observer, referenceEpochMs, openSkyLatencySkewMs, flights, focalLengthMm, sensorType, timeAnchorIsPlanned, wallNowMs]);
}

export function useMoonStateComputed() {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  // Fallback na tickajući wallNowMs ako store još nije sinkroniziran (inicijalna vrijednost je 0)
  const wallNowMs = useWallNowMs();
  return useMemo(
    () =>
      AstroService.getMoonState(
        new Date(referenceEpochMs > 0 ? referenceEpochMs : wallNowMs),
        observer.lat,
        observer.lng,
        observer.groundHeightMeters
      ),
    [observer, referenceEpochMs, wallNowMs]
  );
}
