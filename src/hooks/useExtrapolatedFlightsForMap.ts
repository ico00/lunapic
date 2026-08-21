import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import {
  advanceDisplayPosition,
  type DisplayFix,
} from "@/lib/map/flightDisplayPositionFilter";
import { fieldPerfTime } from "@/lib/perf/fieldPerf";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { FlightState } from "@/types/flight";
import { useCallback, useEffect, useRef, useState } from "react";

// rAF-based tick: updates at most every MIN_TICK_MS to avoid hammering Mapbox setData.
// 80 ms ≈ 12 fps — smooth enough to eliminate the "freeze then jump" appearance while
// keeping GeoJSON rebuilds cheap on lower-end devices.
const MIN_TICK_MS = 80;

/**
 * Prikazane pozicije za jedan tick: meta iz `extrapolateFlightForDisplay`,
 * propuštena kroz `advanceDisplayPosition` da prijelaz na novi raw fix ne
 * povuče marker unatrag. `displayById` se mutira na mjestu (per-avion stanje
 * filtera) — zove se isključivo iz rAF callbacka, nikad tijekom rendera.
 */
function computeDisplayFlights(
  rawFlights: readonly FlightState[],
  latencySkewMs: number,
  nowMs: number,
  displayById: Map<string, DisplayFix>
): readonly FlightState[] {
  const liveIds = new Set<string>();

  const out = rawFlights.map((f) => {
    const target = extrapolateFlightForDisplay(f, nowMs, latencySkewMs);
    liveIds.add(f.id);

    const prev = displayById.get(f.id);
    if (!prev) {
      // Prvi put viđen — nema što gladiti, uzmi metu kakva jest.
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
 * clock + OpenSky skew) filtrirana tako da marker klizi naprijed umjesto da
 * skače/klizi unatrag pri svakom novom raw fixu — vidi
 * `flightDisplayPositionFilter`.
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

  const recompute = useCallback(() => {
    const { flights: latestFlights, openSkyLatencySkewMs } =
      useMoonTransitStore.getState();
    setFlights(
      fieldPerfTime("extrap:flights", () =>
        computeDisplayFlights(
          latestFlights,
          openSkyLatencySkewMs,
          Date.now(),
          displayByIdRef.current
        )
      )
    );
  }, []);

  // Animacijski tick: glatko klizanje između pollova dok je tab vidljiv.
  useEffect(() => {
    let rafId: number;
    const tick = (ts: DOMHighResTimeStamp) => {
      if (ts - lastTickRef.current >= MIN_TICK_MS) {
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
  }, [rawFlights, latencySkewMs, recompute]);

  return flights;
}
