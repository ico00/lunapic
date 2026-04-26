import type { GroundObserver, MoonState, TransitCandidate } from "@/types";
import type { FlightState } from "@/types/flight";
import { horizontalToPoint } from "../geometry/horizontal";
import { angularSeparationDeg } from "../geometry/sky-separation";
import { geodeticToEcef } from "../geometry/wgs84";

const DEFAULT_AIRCRAFT_ANGULAR_RADIUS_DEG = 0.01;
const TYPICAL_FUSELAGE_LENGTH_M = 40;

/**
 * Picks a reasonable ellipsoid height for a flight (prefer geometric altitude).
 */
function targetEllipsoidHeightMeters(
  f: FlightState
): number | null {
  if (f.geoAltitudeMeters != null) {
    return f.geoAltitudeMeters;
  }
  if (f.baroAltitudeMeters != null) {
    return f.baroAltitudeMeters;
  }
  return null;
}

function slantRangeMeters(
  o: GroundObserver,
  targetLat: number,
  targetLng: number,
  targetHeight: number
): number {
  const a = geodeticToEcef(o.lat, o.lng, o.groundHeightMeters);
  const b = geodeticToEcef(targetLat, targetLng, targetHeight);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Half-angle subtended by a ~40m object at the slant range.
 */
function aircraftApparentRadiusDeg(
  flight: FlightState,
  observer: GroundObserver
): number {
  const h = targetEllipsoidHeightMeters(flight);
  if (h == null) {
    return DEFAULT_AIRCRAFT_ANGULAR_RADIUS_DEG;
  }
  const m = slantRangeMeters(
    observer,
    flight.position.lat,
    flight.position.lng,
    h
  );
  if (m <= 0) {
    return DEFAULT_AIRCRAFT_ANGULAR_RADIUS_DEG;
  }
  return (Math.atan(TYPICAL_FUSELAGE_LENGTH_M / m) * 180) / Math.PI;
}

/**
 * Returns flights sorted by angular distance to the moon center, with
 * a flag when they overlap the two discs in the sky.
 */
export function screenTransitCandidates(
  observer: GroundObserver,
  moon: MoonState,
  flights: readonly FlightState[]
): readonly TransitCandidate[] {
  const moonR = moon.apparentRadius.degrees;
  const out: TransitCandidate[] = [];
  for (const flight of flights) {
    const h = targetEllipsoidHeightMeters(flight);
    if (h == null) {
      continue;
    }
    const acDir = horizontalToPoint(
      observer,
      flight.position.lat,
      flight.position.lng,
      h
    );
    const separationDeg = angularSeparationDeg(
      { altitudeDeg: acDir.altitudeDeg, azimuthDeg: acDir.azimuthDeg },
      { altitudeDeg: moon.altitudeDeg, azimuthDeg: moon.azimuthDeg }
    );
    const acR = aircraftApparentRadiusDeg(flight, observer);
    const isPossibleTransit = separationDeg <= moonR + acR;
    out.push({ flight, separationDeg, isPossibleTransit });
  }
  return out.sort((a, b) => a.separationDeg - b.separationDeg);
}
