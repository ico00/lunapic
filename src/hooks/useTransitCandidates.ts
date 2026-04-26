import { AstroService } from "@/lib/domain/astro/astroService";
import { isMoonVisibleFromMoonState } from "@/lib/domain/astro/moonVisibility";
import { screenTransitCandidates } from "@/lib/domain/transit/screening";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useMemo } from "react";

/**
 * Domena: trenutni Mjesec + zrakoplovi u storeu → kandidati za tranzit.
 */
export function useTransitCandidates() {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const flights = useMoonTransitStore((s) => s.flights);
  return useMemo(() => {
    const at = new Date(referenceEpochMs);
    const moon = AstroService.getMoonState(at, observer.lat, observer.lng);
    if (!isMoonVisibleFromMoonState(moon)) {
      return [];
    }
    return screenTransitCandidates(observer, moon, flights);
  }, [observer, referenceEpochMs, flights]);
}

export function useMoonStateComputed() {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  return useMemo(
    () =>
      AstroService.getMoonState(
        new Date(referenceEpochMs),
        observer.lat,
        observer.lng
      ),
    [observer, referenceEpochMs]
  );
}
