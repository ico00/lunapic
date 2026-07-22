import {
  computeActiveTransits,
  DEFAULT_ACTIVE_TRANSIT_TOL_DEG,
} from "@/lib/domain/transit/computeActiveTransits";
import { useWallNowMs } from "@/hooks/useWallNowMs";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useMemo } from "react";

export { azimuthDeltaDeg } from "@/lib/domain/transit/computeActiveTransits";
export type { ActiveTransitRow } from "@/lib/domain/transit/computeActiveTransits";

/**
 * Letovi čija je puna kutna udaljenost na nebeskoj sferi (azimut + elevacija)
 * od centra Mjeseca manja od zadane tolerance.
 *
 * Sva logika je u `computeActiveTransits` (dijeli se sa server-side
 * `/api/transit/scan` rutom) — ovaj hook je samo store-bound wrapper.
 */
export function useActiveTransits(
  toleranceDeg: number = DEFAULT_ACTIVE_TRANSIT_TOL_DEG
) {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const openSkyLatencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const flights = useMoonTransitStore((s) => s.flights);
  const timeAnchorIsPlanned = useMoonTransitStore((s) => s.timeAnchorIsPlanned);
  const wallNowMs = useWallNowMs();
  return useMemo(() => {
    // Planning mode: budući Mjesec + današnji živi letovi nemaju smisla zajedno.
    if (timeAnchorIsPlanned) {
      return [];
    }
    return computeActiveTransits({
      observer,
      flights,
      at: new Date(referenceEpochMs),
      wallNowMs,
      latencySkewMs: openSkyLatencySkewMs,
      toleranceDeg,
    });
  }, [observer, referenceEpochMs, openSkyLatencySkewMs, flights, toleranceDeg, timeAnchorIsPlanned, wallNowMs]);
}
