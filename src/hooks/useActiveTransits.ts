import { useTransitComputedStore } from "@/stores/transit-computed-store";

export { azimuthDeltaDeg } from "@/lib/domain/transit/computeActiveTransits";
export type { ActiveTransitRow } from "@/lib/domain/transit/computeActiveTransits";

/**
 * Letovi čija je puna kutna udaljenost na nebeskoj sferi (azimut + elevacija)
 * od centra Mjeseca manja od `DEFAULT_ACTIVE_TRANSIT_TOL_DEG` (0.5° — jedina
 * tolerancija koju koristi bilo koji pozivatelj).
 *
 * Sva logika je u `computeActiveTransits` (dijeli se sa server-side
 * `/api/transit/scan` rutom), izračunata jednom u `useSharedTransitComputation`
 * — ovaj hook je samo selektor nad dijeljenim rezultatom.
 */
export function useActiveTransits() {
  return useTransitComputedStore((s) => s.activeTransits);
}
