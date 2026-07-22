import { useTransitComputedStore } from "@/stores/transit-computed-store";

/**
 * Domena: trenutni Mjesec + zrakoplovi u storeu → kandidati za tranzit
 * i "in frame" kandidati, enrichani s photographerPack podacima.
 *
 * Sva logika je u `computeTransitCandidates` (dijeli se sa server-side
 * `/api/transit/scan` rutom), izračunata jednom u `useSharedTransitComputation`
 * — ovaj hook je samo selektor nad dijeljenim rezultatom.
 */
export function useTransitCandidates() {
  return useTransitComputedStore((s) => s.candidates);
}

export function useMoonStateComputed() {
  return useTransitComputedStore((s) => s.moon);
}
