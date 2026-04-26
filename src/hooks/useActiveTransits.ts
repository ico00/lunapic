import { AstroService } from "@/lib/domain/astro/astroService";
import {
  nudgeNorthSouthMeters,
  signedAzimuthDiffFromMoonToAcDeg,
} from "@/lib/domain/geometry/alignmentHint";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import type { FlightState } from "@/types/flight";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useMemo } from "react";

const DEFAULT_TOL = 0.5;

/**
 * Minim. kružna razlika azimuta [0, 180].
 */
export function azimuthDeltaDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function formatNudgeText(
  meters: number,
  cardinal: "north" | "south"
): string {
  if (meters < 5) {
    return "For a centered transit: your current position is good enough.";
  }
  const m = Math.round(meters);
  return `For a centered transit, move about ${m} m toward the ${
    cardinal === "south" ? "south" : "north"
  }.`;
}

export type ActiveTransitRow = {
  readonly flight: FlightState;
  readonly deltaAzDeg: number;
  /** Preporuka za tlocrtno „centriranje” (heuristika). */
  readonly nudgeLine: string;
};

/**
 * Letovi čiji se horizontni azimut (iz visine) podudara s azimutom Mjesca
 * unutar zadane tolerance — „na žutoj zraci“.
 */
export function useActiveTransits(
  toleranceDeg: number = DEFAULT_TOL
): readonly ActiveTransitRow[] {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const flights = useMoonTransitStore((s) => s.flights);
  return useMemo(() => {
    const at = new Date(referenceEpochMs);
    const moon = AstroService.getMoonState(at, observer.lat, observer.lng);
    const rows: ActiveTransitRow[] = [];
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
      const deltaAz = azimuthDeltaDeg(moon.azimuthDeg, ac.azimuthDeg);
      if (deltaAz <= toleranceDeg) {
        const signed = signedAzimuthDiffFromMoonToAcDeg(
          moon.azimuthDeg,
          ac.azimuthDeg
        );
        const nudge = nudgeNorthSouthMeters(signed, observer.lat);
        rows.push({
          flight: f,
          deltaAzDeg: deltaAz,
          nudgeLine: formatNudgeText(nudge.meters, nudge.cardinal),
        });
      }
    }
    return rows;
  }, [observer, referenceEpochMs, flights, toleranceDeg]);
}
