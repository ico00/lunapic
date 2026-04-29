import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { fieldPerfTime } from "@/lib/perf/fieldPerf";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { FlightState } from "@/types/flight";
import { useEffect, useMemo, useState } from "react";

/** Manji broj punih `setData` ciklusa na karti (iOS / Safari). */
const WALL_CLOCK_TICK_MS = 400;

/**
 * Letovi iz storea ekstrapolirani za prikaz na karti (wall clock + OpenSky skew).
 */
export function useExtrapolatedFlightsForMap(): readonly FlightState[] {
  const rawFlights = useMoonTransitStore((s) => s.flights);
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const [wallNow, setWallNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => {
      setWallNow(Date.now());
    }, WALL_CLOCK_TICK_MS);
    return () => {
      clearInterval(i);
    };
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
