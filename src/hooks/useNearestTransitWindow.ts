import { AstroService, getTimeSliderWindowMs } from "@/lib/domain/astro/astroService";
import { azimuthDeltaDeg } from "@/hooks/useActiveTransits";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import type { FlightState } from "@/types/flight";
import type { GroundObserver } from "@/types";
import { useMemo } from "react";

const DEFAULT_STEP_MS = 3 * 60_000;

function minAzimuthForFlights(
  timeMs: number,
  observer: GroundObserver,
  flights: readonly FlightState[]
): number {
  const moon = AstroService.getMoonState(
    new Date(timeMs),
    observer.lat,
    observer.lng
  );
  let minD = 180;
  for (const f of flights) {
    const h = f.geoAltitudeMeters ?? f.baroAltitudeMeters;
    if (h == null) {
      continue;
    }
    const ac = horizontalToPoint(
      observer,
      f.position.lat,
      f.position.lng,
      h
    );
    const d = azimuthDeltaDeg(moon.azimuthDeg, ac.azimuthDeg);
    if (d < minD) {
      minD = d;
    }
  }
  return minD;
}

/**
 * Tijekom pomicanja vremena: aproks. najbolji pomicaj unutar **trenutnog**
 * vremenskog prozora klizača (puni UTC dan)
 * za najbližu mjesin–zrakoplovusku alineaciju.
 */
export function useNearestTransitWindow(stepMs: number = DEFAULT_STEP_MS) {
  const observer = useObserverStore((s) => s.observer);
  const timeAnchorMs = useMoonTransitStore((s) => s.timeAnchorMs);
  const timeOffsetMs = useMoonTransitStore((s) => s.timeOffsetMs);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const moonRise = useMoonTransitStore((s) => s.moonRise);
  const moonSet = useMoonTransitStore((s) => s.moonSet);
  const moonRiseSetKind = useMoonTransitStore((s) => s.moonRiseSetKind);
  const flights = useMoonTransitStore((s) => s.flights);

  return useMemo(() => {
    if (flights.length === 0) {
      return {
        bestOffsetMs: 0,
        minDeltaAtBest: 180,
        currentMinDelta: 180,
        label: "No flights in the data — pan the map.",
      };
    }
    const win = getTimeSliderWindowMs(referenceEpochMs, timeAnchorMs, {
      rise: moonRise,
      set: moonSet,
      kind: moonRiseSetKind,
    });
    const width = win.t1 - win.t0;
    let bestOffset = 0;
    let minAtBest = 180;
    for (let o = 0; o <= width; o += stepMs) {
      const ep = win.t0 + o;
      const m = minAzimuthForFlights(ep, observer, flights);
      if (m < minAtBest) {
        minAtBest = m;
        bestOffset = o;
      }
    }
    const currentEp = win.t0 + timeOffsetMs;
    const currentMin = minAzimuthForFlights(currentEp, observer, flights);
    const toward = bestOffset - timeOffsetMs;
    const mins = Math.max(0, Math.round(Math.abs(toward) / 60_000));
    const label = (() => {
      if (currentMin < 0.1 && Math.abs(toward) < stepMs) {
        return "You are very close to a transit window for this offset.";
      }
      if (Math.abs(toward) < stepMs / 2) {
        return `Nearest window: essentially at this offset (min. great-circle Δ ≈ ${minAtBest.toFixed(2)}°).`;
      }
      if (mins === 0) {
        return `Nearest window: time shift under a minute (min. great-circle Δ ≈ ${minAtBest.toFixed(2)}°).`;
      }
      const dir = toward < 0 ? "earlier" : "later";
      return `Nearest window: move the slider toward the ${dir} end (≈ ${mins} min; at that moment min. great-circle Δ ≈ ${minAtBest.toFixed(2)}°).`;
    })();
    return {
      bestOffsetMs: bestOffset,
      minDeltaAtBest: minAtBest,
      currentMinDelta: currentMin,
      label,
    };
  }, [
    observer,
    timeAnchorMs,
    timeOffsetMs,
    referenceEpochMs,
    moonRise,
    moonSet,
    moonRiseSetKind,
    flights,
    stepMs,
  ]);
}
