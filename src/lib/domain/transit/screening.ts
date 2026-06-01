import type { GroundObserver, MoonState, TransitCandidate } from "@/types";
import type { FlightState } from "@/types/flight";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { horizontalToPoint } from "../geometry/horizontal";
import { angularSeparationDeg } from "../geometry/sky-separation";
import { destinationByAzimuthMeters, geodeticToEcef } from "../geometry/wgs84";

const DEFAULT_AIRCRAFT_ANGULAR_RADIUS_DEG = 0.01;
const TYPICAL_FUSELAGE_LENGTH_M = 40;
const APPROACH_LOOKAHEAD_SEC = 30;
const MAX_SLANT_RANGE_METERS = 100_000;

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
 * wallNowMs + latencySkewMs: used to extrapolate stale ADS-B positions.
 */
export function screenTransitCandidates(
  observer: GroundObserver,
  moon: MoonState,
  flights: readonly FlightState[],
  wallNowMs: number,
  latencySkewMs: number
): readonly TransitCandidate[] {
  const moonR = moon.apparentRadius.degrees;
  const out: TransitCandidate[] = [];
  for (const rawFlight of flights) {
    const flight = extrapolateFlightForDisplay(rawFlight, wallNowMs, latencySkewMs);
    const h = targetEllipsoidHeightMeters(flight);
    if (h == null) {
      continue;
    }
    if (slantRangeMeters(observer, flight.position.lat, flight.position.lng, h) > MAX_SLANT_RANGE_METERS) {
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

    // Odbaci avione koji se udaljuju od Mjeseca: ekstrapoliraj 30s naprijed i
    // usporedi separaciju — ako raste, avion nema šanse za tranzit.
    const v = flight.groundSpeedMps ?? 0;
    const tr = flight.trackDeg;
    if (v > 1 && tr != null && Number.isFinite(tr)) {
      const futurePos = destinationByAzimuthMeters(
        flight.position.lat,
        flight.position.lng,
        tr,
        v * APPROACH_LOOKAHEAD_SEC
      );
      const futureDir = horizontalToPoint(observer, futurePos.lat, futurePos.lng, h);
      const futureSepDeg = angularSeparationDeg(
        { altitudeDeg: futureDir.altitudeDeg, azimuthDeg: futureDir.azimuthDeg },
        { altitudeDeg: moon.altitudeDeg, azimuthDeg: moon.azimuthDeg }
      );
      if (futureSepDeg >= separationDeg) {
        continue;
      }
    }

    const acR = aircraftApparentRadiusDeg(flight, observer);
    const isPossibleTransit = separationDeg <= moonR + acR;
    out.push({ flight, separationDeg, isPossibleTransit, elevationGapDeg: null, willTransit: false });
  }
  return out.sort((a, b) => a.separationDeg - b.separationDeg);
}
