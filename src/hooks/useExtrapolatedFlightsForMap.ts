import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import {
  advanceDisplayPosition,
  type DisplayFix,
} from "@/lib/map/flightDisplayPositionFilter";
import { FLIGHT_ANIMATION_INTERVAL_MS } from "@/lib/map/flightAnimationTiming";
import { fieldPerfTime } from "@/lib/perf/fieldPerf";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { FlightState } from "@/types/flight";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Prikazane pozicije za jedan tick: meta iz `extrapolateFlightForDisplay`,
 * propuštena kroz `advanceDisplayPosition` za neodabrane avione. Odabrani
 * avion koristi samu metu, identično Photographer brojaču i bez zaostatka.
 * `displayById` se mutira na mjestu (per-avion stanje
 * filtera) — zove se isključivo iz rAF callbacka, nikad tijekom rendera.
 */
export function computeDisplayFlights(
  rawFlights: readonly FlightState[],
  latencySkewMs: number,
  nowMs: number,
  displayById: Map<string, DisplayFix>,
  selectedFlightId: string | null
): readonly FlightState[] {
  const liveIds = new Set<string>();

  const out = rawFlights.map((f) => {
    const target = extrapolateFlightForDisplay(f, nowMs, latencySkewMs);
    liveIds.add(f.id);

    const prev = displayById.get(f.id);
    if (!prev || f.id === selectedFlightId) {
      // Selected geometry must match Photographer's extrapolated fix. The
      // catch-up filter can lag a new fix by kilometres and show a future
      // crossing on the map after the countdown has already passed it.
      // Reset filter state too, so deselection continues from this position.
      displayById.set(f.id, {
        lat: target.position.lat,
        lng: target.position.lng,
        atMs: nowMs,
      });
      return target;
    }

    const next = advanceDisplayPosition({
      prev,
      target: target.position,
      trackDeg: f.trackDeg ?? null,
      groundSpeedMps: f.groundSpeedMps ?? null,
      nowMs,
    });
    displayById.set(f.id, next);
    return { ...target, position: { lat: next.lat, lng: next.lng } };
  });

  // Skini letove kojih više nema u storeu da mapa ne raste neograničeno
  // tijekom dugotrajno otvorenog taba.
  for (const id of displayById.keys()) {
    if (!liveIds.has(id)) displayById.delete(id);
  }

  return out;
}

/**
 * Letovi iz storea, pozicionirani za prikaz na karti: ekstrapolacija (rAF wall
 * clock + OpenSky skew). Neodabrani markeri koriste `flightDisplayPositionFilter`;
 * odabrani odmah prihvaća korekcije fixa da karta i Photographer budu usklađeni.
 *
 * Izračun živi u callbacku (rAF tick + effect na promjenu storea), ne u
 * `useMemo`: filter nosi per-avion stanje u refu, a ref se ne smije dirati
 * tijekom rendera.
 */
export function useExtrapolatedFlightsForMap(): readonly FlightState[] {
  const displayByIdRef = useRef(new Map<string, DisplayFix>());
  const lastTickRef = useRef(0);
  const [flights, setFlights] = useState<readonly FlightState[]>([]);

  // Store pretplata služi samo kao okidač (vrijednosti se čitaju u `recompute`
  // preko `getState`) — bez nje bi prikaz ovisio ISKLJUČIVO o rAF-u, pa bi u
  // skrivenom/throttlanom tabu (gdje rAF stane) karta ostala bez ijednog aviona.
  const rawFlights = useMoonTransitStore((s) => s.flights);
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);

  const recompute = useCallback(() => {
    const { flights: latestFlights, openSkyLatencySkewMs, selectedFlightId } =
      useMoonTransitStore.getState();
    setFlights(
      fieldPerfTime("extrap:flights", () =>
        computeDisplayFlights(
          latestFlights,
          openSkyLatencySkewMs,
          Date.now(),
          displayByIdRef.current,
          selectedFlightId
        )
      )
    );
  }, []);

  // Animacijski tick: glatko klizanje između pollova dok je tab vidljiv.
  useEffect(() => {
    let rafId: number;
    const tick = (ts: DOMHighResTimeStamp) => {
      if (ts - lastTickRef.current >= FLIGHT_ANIMATION_INTERVAL_MS) {
        lastTickRef.current = ts;
        recompute();
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [recompute]);

  // Svjež podatak iz storea mora se prikazati i kad rAF ne radi (skriven tab,
  // throttling) — i odmah na mountu, bez čekanja prvog framea.
  useEffect(() => {
    recompute();
  }, [rawFlights, latencySkewMs, selectedFlightId, recompute]);

  return flights;
}
