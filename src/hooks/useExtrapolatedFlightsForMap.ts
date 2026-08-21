import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { exponentialSmoothStep } from "@/lib/map/exponentialSmoothPosition";
import { fieldPerfTime } from "@/lib/perf/fieldPerf";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { FlightState } from "@/types/flight";
import { useEffect, useRef, useState } from "react";

// rAF-based tick: updates at most every MIN_TICK_MS to avoid hammering Mapbox setData.
// 80 ms ≈ 12 fps — smooth enough to eliminate the "freeze then jump" appearance while
// keeping GeoJSON rebuilds cheap on lower-end devices.
const MIN_TICK_MS = 80;

/**
 * Vremenska konstanta eksponencijalnog glađenja prikazane pozicije prema
 * `extrapolateFlightForDisplay`-ovoj meti. `extrapolateFlightForDisplay` nema
 * nikakav smoothing — svaki put kad stigne novi raw fix, meta se pomakne na
 * novu dead-reckoning bazu, i bez ovoga bi se marker INSTANT presložio na nju.
 * Za localsdr to je gotovo nevidljivo (raw fix se dobro poklapa s ekstrapolacijom),
 * ali avionix (Nano) ima primjetno šumovitiju raw poziciju iz ticka u tick
 * (RF/multipath, ista pojava zbog koje je localsdr dobio sticky prioritet u
 * povijesnom trailu i live-merge-u) — svaki novi raw fix zna sletjeti stotinjak
 * do koji stotina metara "iza" mjesta gdje je ekstrapolacija već stigla, što se
 * vidi kao skok unatrag na ~10s ciklusu (dijagnosticirano 2026-08-21). Rješenje
 * je opće (djeluje na bilo koji izvor), ne avionix-specifično uvjetovanje.
 */
const POSITION_SMOOTH_TAU_MS = 900;

type SmoothedPoint = { readonly lat: number; readonly lng: number; readonly atMs: number };

/**
 * Letovi iz storea ekstrapolirani za prikaz na karti (rAF wall clock + OpenSky skew),
 * s eksponencijalnim glađenjem prikazane pozicije da diskontinuitet pri dolasku
 * novog raw fixa (vidi `POSITION_SMOOTH_TAU_MS`) izgleda kao kratko "uhvati me"
 * umjesto instant skoka.
 */
export function useExtrapolatedFlightsForMap(): readonly FlightState[] {
  const rawFlights = useMoonTransitStore((s) => s.flights);
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const [wallNow, setWallNow] = useState(() => Date.now());
  const lastTickRef = useRef(0);
  const smoothedByIdRef = useRef(new Map<string, SmoothedPoint>());
  const [smoothedFlights, setSmoothedFlights] = useState<readonly FlightState[]>([]);

  useEffect(() => {
    let rafId: number;
    const tick = (ts: DOMHighResTimeStamp) => {
      if (ts - lastTickRef.current >= MIN_TICK_MS) {
        lastTickRef.current = ts;
        setWallNow(Date.now());
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Ref-based smoothing state mora se čitati/pisati u effectu, ne tijekom
  // rendera (`react-hooks/refs`) — zato ovo nije `useMemo`.
  useEffect(() => {
    setSmoothedFlights(
      fieldPerfTime("extrap:flights", () => {
        const smoothed = smoothedByIdRef.current;
        const liveIds = new Set<string>();
        const out = rawFlights.map((f) => {
          const target = extrapolateFlightForDisplay(f, wallNow, latencySkewMs);
          liveIds.add(f.id);
          const prev = smoothed.get(f.id);
          if (!prev) {
            smoothed.set(f.id, { lat: target.position.lat, lng: target.position.lng, atMs: wallNow });
            return target;
          }
          const dtMs = Math.max(0, wallNow - prev.atMs);
          const position = exponentialSmoothStep(
            prev,
            target.position,
            dtMs,
            POSITION_SMOOTH_TAU_MS
          );
          smoothed.set(f.id, { ...position, atMs: wallNow });
          return { ...target, position };
        });
        // Skini letove koji su nestali iz storea da mapa ne raste neograničeno
        // tijekom dugotrajno otvorenog taba.
        for (const id of smoothed.keys()) {
          if (!liveIds.has(id)) smoothed.delete(id);
        }
        return out;
      })
    );
  }, [rawFlights, wallNow, latencySkewMs]);

  return smoothedFlights;
}
