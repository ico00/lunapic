import { isMoonVisibleFromMoonState } from "@/lib/domain/astro/moonVisibility";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import {
  maxShotRangeMetersForCamera,
  type CameraSensorType,
} from "@/lib/domain/geometry/shotFeasibility";
import { screenTransitCandidates } from "@/lib/domain/transit/screening";
import type { GroundObserver } from "@/types/geo";
import type { MoonState } from "@/types/moon";
import type { FlightState } from "@/types/flight";

/**
 * Aircraft shown **green** on the map: geometric moon overlap **and** within
 * optical reach for the current focal length / sensor crop.
 */
export function computeShotFeasibleFlightIds(
  observer: GroundObserver,
  moon: MoonState,
  flights: readonly FlightState[],
  cameraFocalLengthMm: number,
  cameraSensorType: CameraSensorType
): ReadonlySet<string> {
  const out = new Set<string>();
  if (!isMoonVisibleFromMoonState(moon)) {
    return out;
  }
  const candidates = screenTransitCandidates(observer, moon, flights);
  const candidateIds = new Set(
    candidates.filter((x) => x.isPossibleTransit).map((x) => x.flight.id)
  );
  if (candidateIds.size === 0) {
    return out;
  }
  const maxRangeM = maxShotRangeMetersForCamera(
    cameraFocalLengthMm,
    cameraSensorType
  );
  for (const f of flights) {
    if (!candidateIds.has(f.id)) {
      continue;
    }
    const kin = GeometryEngine.aircraftLineOfSightKinematics(observer, f);
    if (kin && kin.slantRangeMeters <= maxRangeM) {
      out.add(f.id);
    }
  }
  return out;
}
