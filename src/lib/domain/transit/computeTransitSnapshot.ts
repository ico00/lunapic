import { AstroService } from "@/lib/domain/astro/astroService";
import {
  computeActiveTransits,
  DEFAULT_ACTIVE_TRANSIT_TOL_DEG,
  type ActiveTransitRow,
} from "@/lib/domain/transit/computeActiveTransits";
import { computeShotFeasibleFlightIds } from "@/lib/domain/transit/computeShotFeasibleFlightIds";
import { computeTransitCandidates } from "@/lib/domain/transit/computeTransitCandidates";
import type { CameraSensorType } from "@/lib/domain/geometry/shotFeasibility";
import type { GroundObserver } from "@/types/geo";
import type { FlightState } from "@/types/flight";
import type { MoonState } from "@/types/moon";
import type { TransitCandidate } from "@/types/transit";

export type TransitSnapshot = {
  /** Mjesec za prikaz: prati vremenski klizač i planirani datum. */
  readonly moon: MoonState;
  /** Mjesec sada: sve što se uspoređuje sa živim letovima koristi njega. */
  readonly liveMoon: MoonState;
  readonly candidates: readonly TransitCandidate[];
  readonly activeTransits: readonly ActiveTransitRow[];
  /** Zelena oznaka na karti: preklapanje sada i unutar dosega kamere. */
  readonly shotFeasibleFlightIds: ReadonlySet<string>;
  /** Prsten na karti: isti letovi kao "Disk transit" u panelu kandidata. */
  readonly confirmedTransitFlightIds: ReadonlySet<string>;
};

export type ComputeTransitSnapshotArgs = {
  readonly observer: GroundObserver;
  readonly focalLengthMm: number;
  readonly sensorType: CameraSensorType;
  readonly flights: readonly FlightState[];
  /** Trenutak klizača; utječe samo na `moon`. */
  readonly referenceEpochMs: number;
  readonly wallNowMs: number;
  readonly latencySkewMs: number;
  readonly isPlanned: boolean;
};

/**
 * Jedan izračun po ticku, vidi `useSharedTransitComputation`.
 *
 * Živi letovi se uvijek uspoređuju sa stvarnim Mjesecom, kao na serveru:
 * klizač je prikaz, pa ostavljen na +4 h ne smije ni izmišljati tranzite ni
 * utišati prave. Samo planirani datum gasi kandidate.
 */
export function computeTransitSnapshot({
  observer,
  focalLengthMm,
  sensorType,
  flights,
  referenceEpochMs,
  wallNowMs,
  latencySkewMs,
  isPlanned,
}: ComputeTransitSnapshotArgs): TransitSnapshot {
  const moonAt = (ms: number) =>
    AstroService.getMoonState(
      new Date(ms),
      observer.lat,
      observer.lng,
      observer.groundHeightMeters
    );
  const moon = moonAt(referenceEpochMs > 0 ? referenceEpochMs : wallNowMs);
  const liveMoon = moonAt(wallNowMs);
  if (isPlanned) {
    return {
      moon,
      liveMoon,
      candidates: [],
      activeTransits: [],
      shotFeasibleFlightIds: new Set(),
      confirmedTransitFlightIds: new Set(),
    };
  }
  const at = new Date(wallNowMs);
  const candidates = computeTransitCandidates({
    observer,
    focalLengthMm,
    sensorType,
    flights,
    at,
    wallNowMs,
    latencySkewMs,
  });
  const activeTransits = computeActiveTransits({
    observer,
    flights,
    at,
    wallNowMs,
    latencySkewMs,
    toleranceDeg: DEFAULT_ACTIVE_TRANSIT_TOL_DEG,
  });
  const shotFeasibleFlightIds = computeShotFeasibleFlightIds(
    observer,
    liveMoon,
    flights,
    wallNowMs,
    latencySkewMs,
    focalLengthMm,
    sensorType
  );
  const confirmedTransitFlightIds = new Set(
    candidates.filter((c) => c.willTransit).map((c) => c.flight.id)
  );
  return {
    moon,
    liveMoon,
    candidates,
    activeTransits,
    shotFeasibleFlightIds,
    confirmedTransitFlightIds,
  };
}
