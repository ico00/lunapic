import { AstroService } from "@/lib/domain/astro/astroService";
import { DEFAULT_OBSERVER_LOCATION } from "@/lib/defaultObserverLocation";
import type { TransitSnapshot } from "@/lib/domain/transit/computeTransitSnapshot";
import { create } from "zustand";

export type TransitComputedState = TransitSnapshot;

/**
 * Dijeljeni izračun (Mjesec / transit kandidati / active transits) — jednom po
 * ticku, ne po komponenti. Piše `useSharedTransitComputation` (mount jednom u
 * `HomePageClient`); ostatak aplikacije čita kroz `useMoonStateComputed`,
 * `useTransitCandidates`, `useActiveTransits` (selektori nad ovim storeom).
 *
 * Prije ovoga je svaka od ~6 komponenti (MapContainer, FieldOverlaysSection,
 * CompassAimPanel, useHomeShellOrchestration, ArSkyCameraPanel) imala vlastiti
 * rAF tick + vlastiti `computeTransitCandidates`/`computeActiveTransits` poziv
 * nad cijelim `flights` nizom — isti posao dupliciran 4-6x, nekoliko puta u
 * sekundi, kontinuirano dok je app otvorena.
 */
export const useTransitComputedStore = create<TransitComputedState>(() => {
  const moon = AstroService.getMoonState(
    new Date(),
    DEFAULT_OBSERVER_LOCATION.lat,
    DEFAULT_OBSERVER_LOCATION.lng,
    DEFAULT_OBSERVER_LOCATION.groundHeightMeters
  );
  return {
    moon,
    liveMoon: moon,
    candidates: [],
    activeTransits: [],
    shotFeasibleFlightIds: new Set(),
    confirmedTransitFlightIds: new Set(),
  };
});
