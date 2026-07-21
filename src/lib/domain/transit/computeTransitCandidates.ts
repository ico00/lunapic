import { AstroService } from "@/lib/domain/astro/astroService";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import {
  verticalFovDeg,
  type CameraSensorType,
} from "@/lib/domain/geometry/shotFeasibility";
import { screenTransitCandidates } from "@/lib/domain/transit/screening";
import type { GroundObserver } from "@/types/geo";
import type { FlightState } from "@/types/flight";
import type { TransitCandidate } from "@/types/transit";

/**
 * Practical photography limit: only flights within this slant range
 * (at the predicted alignment position) are classified as willTransit.
 * Matches the 100 km radius shown on the map.
 */
export const MAX_TRANSIT_SLANT_METERS = 100_000;

export type ComputeTransitCandidatesArgs = {
  readonly observer: GroundObserver;
  readonly focalLengthMm: number;
  readonly sensorType: CameraSensorType;
  readonly flights: readonly FlightState[];
  /** Reference epoch used for the moon position. */
  readonly at: Date;
  /** Wall-clock ms used to extrapolate stale ADS-B positions. */
  readonly wallNowMs: number;
  readonly latencySkewMs: number;
};

/**
 * Pura jezgra detekcije transit kandidata — dijele je `useTransitCandidates`
 * (client) i `/api/transit/scan` (server). **Jedini izvor pipelinea**; pragovi
 * dokumentirani u AGENTS.md.
 *
 * Gornja granica elevation gapa = pola vertikalnog FOV-a odabrane kamere:
 * sve što stane u kadar je relevantno, bez obzira prolazi li disk ili ne.
 */
export function computeTransitCandidates({
  observer,
  focalLengthMm,
  sensorType,
  flights,
  at,
  wallNowMs,
  latencySkewMs,
}: ComputeTransitCandidatesArgs): readonly TransitCandidate[] {
  const moon = AstroService.getMoonState(
    at,
    observer.lat,
    observer.lng,
    observer.groundHeightMeters
  );
  // Below CRITICAL_BELOW_DEG (5°) the moon is likely blocked by buildings/terrain —
  // same threshold shown as "Critical / Hidden" in MoonEphemerisPanel.
  if (moon.altitudeDeg < CRITICAL_BELOW_DEG) {
    return [];
  }
  // Pola vertikalnog FOV-a: ako je elevation gap unutar ove granice, oboje stanu u kadar.
  const halfFovDeg = verticalFovDeg(focalLengthMm, sensorType) / 2;
  const screened = screenTransitCandidates(observer, moon, flights, wallNowMs, latencySkewMs);
  const enriched: TransitCandidate[] = [];
  for (const c of screened) {
    const pack = GeometryEngine.photographerPack(observer, c.flight, moon, at, {
      airlinerLengthMeters: c.flight.lengthMeters ?? undefined,
    });
    // Nema predviđenog azimutalnog alignmenta → avion nema šanse biti u kadru s Mjesecom.
    if (pack !== null && pack.timeToAlignmentSec === null) {
      continue;
    }
    const gap = pack?.elevationGapAtAlignmentDeg ?? null;
    // Izvan kadra odabrane kamere → nije relevantno.
    if (gap !== null && Math.abs(gap) > halfFovDeg) {
      continue;
    }
    // Transit (alignment) predicted outside photographable range → exclude entirely.
    // A plane 200+ km away at alignment time cannot be photographed regardless of
    // whether it crosses the moon disc or sits within the FOV angle.
    if (pack?.futureSlantMeters != null && pack.futureSlantMeters > MAX_TRANSIT_SLANT_METERS) {
      continue;
    }
    enriched.push({
      ...c,
      elevationGapDeg: gap,
      willTransit: pack?.willActuallyTransit ?? false,
    });
  }
  return enriched;
}
