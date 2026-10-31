import { MoonTransitHoldTone, playShortBeep } from "@/lib/audio/fieldAudio";
import { screenTransitCandidates } from "@/lib/domain/transit/screening";
import type { GroundObserver } from "@/types/geo";
import type { MoonState } from "@/types/moon";
import type { FlightState } from "@/types/flight";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useTransitComputedStore } from "@/stores/transit-computed-store";
import { useWallNowMs } from "@/hooks/useWallNowMs";
import { useEffect, useMemo, useRef } from "react";

type UseTransitFieldSoundsArgs = {
  enabled: boolean;
  selectedFlightId: string | null;
  observer: GroundObserver;
  moon: MoonState;
  flights: readonly FlightState[];
};

/**
 * When **Field sounds** are enabled and a flight is selected:
 * - One **chime** when that aircraft enters the **green** (shot-feasible) set.
 * - A **soft hold tone** while the aircraft stays in the **moon-overlap** disc
 *   model (`screenTransitCandidates` — same geometry as map overlap).
 */
export function useTransitFieldSounds(a: UseTransitFieldSoundsArgs): void {
  const {
    enabled,
    selectedFlightId,
    observer,
    moon,
    flights,
  } = a;

  const openSkyLatencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const isPlanned = useMoonTransitStore((s) => s.timeAnchorIsPlanned);
  const wallNowMs = useWallNowMs();

  const selectedIsShotFeasible = useTransitComputedStore(
    (s) => selectedFlightId != null && s.shotFeasibleFlightIds.has(selectedFlightId)
  );

  const selectedDiscOverlap = useMemo(() => {
    if (!enabled || isPlanned || selectedFlightId == null) {
      return false;
    }
    const row = screenTransitCandidates(observer, moon, flights.filter((f) => f.id === selectedFlightId), wallNowMs, openSkyLatencySkewMs).find(
      (x) => x.flight.id === selectedFlightId
    );
    return row?.isPossibleTransit ?? false;
  }, [enabled, isPlanned, observer, moon, flights, wallNowMs, openSkyLatencySkewMs, selectedFlightId]);

  const holdRef = useRef<MoonTransitHoldTone | null>(null);
  const prevGreenRef = useRef(false);
  const prevSelRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevSelRef.current !== selectedFlightId) {
      prevGreenRef.current = false;
      prevSelRef.current = selectedFlightId;
    }
  }, [selectedFlightId]);

  useEffect(() => {
    if (!enabled || selectedFlightId == null) {
      prevGreenRef.current = false;
      return;
    }
    if (selectedIsShotFeasible && !prevGreenRef.current) {
      playShortBeep(1046, 0.11, 0.12);
    }
    prevGreenRef.current = selectedIsShotFeasible;
  }, [enabled, selectedFlightId, selectedIsShotFeasible]);

  useEffect(() => {
    if (!enabled || selectedFlightId == null || !selectedDiscOverlap) {
      holdRef.current?.stop();
      holdRef.current = null;
      return;
    }
    if (holdRef.current == null) {
      holdRef.current = new MoonTransitHoldTone();
      holdRef.current.start(392, 0.052);
    }
    return () => {
      holdRef.current?.stop();
      holdRef.current = null;
    };
  }, [enabled, selectedFlightId, selectedDiscOverlap]);
}
