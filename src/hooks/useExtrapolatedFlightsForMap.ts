import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { fieldPerfTime } from "@/lib/perf/fieldPerf";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { FlightState } from "@/types/flight";
import { useEffect, useMemo, useRef, useState } from "react";

// rAF-based tick: updates at most every MIN_TICK_MS to avoid hammering Mapbox setData.
// 80 ms ≈ 12 fps — smooth enough to eliminate the "freeze then jump" appearance while
// keeping GeoJSON rebuilds cheap on lower-end devices.
const MIN_TICK_MS = 80;

/**
 * Letovi iz storea ekstrapolirani za prikaz na karti (rAF wall clock + OpenSky skew).
 */
export function useExtrapolatedFlightsForMap(): readonly FlightState[] {
  const rawFlights = useMoonTransitStore((s) => s.flights);
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const [wallNow, setWallNow] = useState(() => Date.now());
  const lastTickRef = useRef(0);

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

  return useMemo(
    () =>
      fieldPerfTime("extrap:flights", () =>
        rawFlights.map((f) =>
          extrapolateFlightForDisplay(f, wallNow, latencySkewMs)
        )
      ),
    [rawFlights, wallNow, latencySkewMs]
  );
}
