import { isMoonVisibleFromMoonState } from "@/lib/domain/astro/moonVisibility";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import { screenTransitCandidates } from "@/lib/domain/transit/screening";
import type { GroundObserver } from "@/types/geo";
import type { MoonState } from "@/types/moon";
import type { FlightState } from "@/types/flight";

/**
 * Aircraft with a confirmed disk transit predicted: azimuth alignment is
 * coming AND the full sky angular separation at that moment will be within
 * the moon+aircraft disk radii. These get the green badge on the map.
 */
export function computeConfirmedTransitFlightIds(
  observer: GroundObserver,
  moon: MoonState,
  flights: readonly FlightState[],
  at: Date,
  wallNowMs: number,
  latencySkewMs: number
): ReadonlySet<string> {
  const out = new Set<string>();
  if (!isMoonVisibleFromMoonState(moon)) {
    return out;
  }
  const candidates = screenTransitCandidates(observer, moon, flights, wallNowMs, latencySkewMs);
  for (const { flight } of candidates) {
    const pack = GeometryEngine.photographerPack(observer, flight, moon, at, {});
    if (pack?.willActuallyTransit) {
      out.add(flight.id);
    }
  }
  return out;
}
