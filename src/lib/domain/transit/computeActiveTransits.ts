import { AstroService } from "@/lib/domain/astro/astroService";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import {
  nudgeBearing,
  signedAzimuthDiffFromMoonToAcDeg,
} from "@/lib/domain/geometry/alignmentHint";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { isFlightFixStale } from "@/lib/flight/flightFixFreshness";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { angularSeparationDeg } from "@/lib/domain/geometry/sky-separation";
import type { GroundObserver } from "@/types/geo";
import type { FlightState } from "@/types/flight";

export const DEFAULT_ACTIVE_TRANSIT_TOL_DEG = 0.5;

const CARDINAL_NAMES: Record<string, string> = {
  N: "north", NE: "north-east", E: "east", SE: "south-east",
  S: "south", SW: "south-west", W: "west", NW: "north-west",
};

function bearingToCardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Minim. kružna razlika azimuta [0, 180].
 */
export function azimuthDeltaDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export type ActiveTransitRow = {
  readonly flight: FlightState;
  /** Full 2D sky angular separation (azimuth + elevation) from moon centre, degrees. */
  readonly separationDeg: number;
  readonly nudgeLine: string;
  readonly nudgeMeters: number;
  /** True compass bearing to walk (0-360), perpendicular to Moon's ray. */
  readonly nudgeBearingDeg: number;
};

export type ComputeActiveTransitsArgs = {
  readonly observer: GroundObserver;
  readonly flights: readonly FlightState[];
  /** Reference epoch used for the moon position. */
  readonly at: Date;
  /** Wall-clock ms used to extrapolate stale ADS-B positions. */
  readonly wallNowMs: number;
  readonly latencySkewMs: number;
  readonly toleranceDeg?: number;
};

/**
 * Pura jezgra "active transit" detekcije — dijele je `useActiveTransits` (client)
 * i `/api/transit/scan` (server). Let je aktivan kad mu je puna 2D kutna separacija
 * od centra Mjeseca ≤ tolerance.
 */
export function computeActiveTransits({
  observer,
  flights,
  at,
  wallNowMs,
  latencySkewMs,
  toleranceDeg = DEFAULT_ACTIVE_TRANSIT_TOL_DEG,
}: ComputeActiveTransitsArgs): readonly ActiveTransitRow[] {
  const moon = AstroService.getMoonState(
    at,
    observer.lat,
    observer.lng,
    observer.groundHeightMeters
  );
  if (moon.altitudeDeg < CRITICAL_BELOW_DEG) {
    return [];
  }
  const rows: ActiveTransitRow[] = [];
  for (const rawFlight of flights) {
    // Isti prag kao u screeningu — alert iz zamrznute pozicije je lažan.
    if (isFlightFixStale(rawFlight, wallNowMs, latencySkewMs)) {
      continue;
    }
    const f = extrapolateFlightForDisplay(rawFlight, wallNowMs, latencySkewMs);
    const h = f.geoAltitudeMeters ?? f.baroAltitudeMeters;
    if (h == null) {
      continue;
    }
    const ac = horizontalToPoint(observer, f.position.lat, f.position.lng, h);
    const sep = angularSeparationDeg(
      { altitudeDeg: ac.altitudeDeg, azimuthDeg: ac.azimuthDeg },
      { altitudeDeg: moon.altitudeDeg, azimuthDeg: moon.azimuthDeg }
    );
    if (sep <= toleranceDeg) {
      const signed = signedAzimuthDiffFromMoonToAcDeg(moon.azimuthDeg, ac.azimuthDeg);
      const { bearingDeg, meters } = nudgeBearing(signed, moon.azimuthDeg);
      const cardinal = bearingToCardinal(bearingDeg);
      const nudgeLine =
        meters < 5
          ? "Your position is good enough for a centered transit."
          : `Move about ${Math.round(meters)} m toward the ${CARDINAL_NAMES[cardinal] ?? cardinal}.`;
      rows.push({
        flight: f,
        separationDeg: sep,
        nudgeLine,
        nudgeMeters: meters,
        nudgeBearingDeg: bearingDeg,
      });
    }
  }
  return rows;
}
