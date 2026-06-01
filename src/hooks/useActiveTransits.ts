import { AstroService } from "@/lib/domain/astro/astroService";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import {
  nudgeBearing,
  signedAzimuthDiffFromMoonToAcDeg,
} from "@/lib/domain/geometry/alignmentHint";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { angularSeparationDeg } from "@/lib/domain/geometry/sky-separation";
import type { FlightState } from "@/types/flight";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useMemo } from "react";

const DEFAULT_TOL = 0.5;

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

/**
 * Letovi čija je puna kutna udaljenost na nebeskoj sferi (azimut + elevacija)
 * od centra Mjeseca manja od zadane tolerance.
 */
export function useActiveTransits(
  toleranceDeg: number = DEFAULT_TOL
): readonly ActiveTransitRow[] {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const openSkyLatencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const flights = useMoonTransitStore((s) => s.flights);
  return useMemo(() => {
    const wallNowMs = Date.now();
    const at = new Date(referenceEpochMs);
    const moon = AstroService.getMoonState(at, observer.lat, observer.lng, observer.groundHeightMeters);
    if (moon.altitudeDeg < CRITICAL_BELOW_DEG) {
      return [];
    }
    const rows: ActiveTransitRow[] = [];
    for (const rawFlight of flights) {
      const f = extrapolateFlightForDisplay(rawFlight, wallNowMs, openSkyLatencySkewMs);
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
        const signed = signedAzimuthDiffFromMoonToAcDeg(
          moon.azimuthDeg,
          ac.azimuthDeg
        );
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
  }, [observer, referenceEpochMs, openSkyLatencySkewMs, flights, toleranceDeg]);
}
