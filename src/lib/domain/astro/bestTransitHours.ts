import { AstroService } from "./astroService";
import { CRITICAL_BELOW_DEG } from "./moonFieldVisibilityAdvice";
import {
  aircraftAngularSizeDeg,
  moonCoveragePercent,
} from "@/lib/domain/geometry/shotFeasibility";
import type { GroundObserver } from "@/types/geo";

/**
 * "Best hours" za planirani dan: po satu procjena koliko bi velik bio avion u
 * krstarenju koji prijeđe preko Mjeseca. Fizika iz jedne varijable:
 *
 *   slant ≈ (visina krstarenja − visina promatrača) / sin(elevacija Mjeseca)
 *   coverage % = kutna veličina aviona (default 40 m) / 0.5° Mjeseca
 *
 * Čisti ephemeris — ne treba nikakav live podatak, radi za bilo koji datum.
 */

/** Tipična visina krstarenja putničkog jeta (m MSL). */
export const CRUISE_ALTITUDE_METERS = 11_000;
/** Default raspon krila (m) — isti kao `DEFAULT_WINGSPAN_M` u shot feasibility. */
const DEFAULT_WINGSPAN_METERS = 40;
/** Prag "great": silueta ≥ 15 % promjera Mjeseca (slant ≲ 26 km, elevacija ≳ 25°). */
export const GREAT_MIN_COVERAGE_PERCENT = 15;
/** Prag "ok": silueta ≥ 8 % promjera Mjeseca (slant ≲ 48 km, elevacija ≳ 13°). */
export const OK_MIN_COVERAGE_PERCENT = 8;

export type BestHourTier = "great" | "ok" | "poor" | "belowHorizon";

export type BestHourSample = {
  /** Početak sata (lokalno vrijeme promatrača), epoch ms. */
  readonly hourStartMs: number;
  /** Elevacija Mjeseca na sredini sata (deg). */
  readonly moonAltitudeDeg: number;
  /** Slant do jeta u krstarenju na liniji prema Mjesecu (m), ili null ispod praga vidljivosti. */
  readonly slantMeters: number | null;
  /** Očekivana silueta (% promjera Mjeseca, default 40 m avion), ili null. */
  readonly coveragePercent: number | null;
  readonly tier: BestHourTier;
};

function tierForCoverage(coverage: number | null): BestHourTier {
  if (coverage == null) {
    return "belowHorizon";
  }
  if (coverage >= GREAT_MIN_COVERAGE_PERCENT) {
    return "great";
  }
  if (coverage >= OK_MIN_COVERAGE_PERCENT) {
    return "ok";
  }
  return "poor";
}

/**
 * 24 satna uzorka za dan koji počinje na `dayStartMs` (lokalna ponoć).
 * Elevacija se uzorkuje na sredini sata (HH:30) da reprezentira cijeli sat.
 */
export function computeBestTransitHours(
  observer: GroundObserver,
  dayStartMs: number
): readonly BestHourSample[] {
  const out: BestHourSample[] = [];
  const jetHeightAboveObserver = Math.max(
    1_000,
    CRUISE_ALTITUDE_METERS - (observer.groundHeightMeters ?? 0)
  );
  for (let hour = 0; hour < 24; hour += 1) {
    const hourStartMs = dayStartMs + hour * 3_600_000;
    const midMs = hourStartMs + 1_800_000;
    const moon = AstroService.getMoonState(
      new Date(midMs),
      observer.lat,
      observer.lng,
      observer.groundHeightMeters
    );
    const alt = moon.altitudeDeg;
    if (alt < CRITICAL_BELOW_DEG) {
      out.push({
        hourStartMs,
        moonAltitudeDeg: alt,
        slantMeters: null,
        coveragePercent: null,
        tier: "belowHorizon",
      });
      continue;
    }
    const slantMeters =
      jetHeightAboveObserver / Math.sin((alt * Math.PI) / 180);
    const coveragePercent = moonCoveragePercent(
      aircraftAngularSizeDeg(DEFAULT_WINGSPAN_METERS, slantMeters)
    );
    out.push({
      hourStartMs,
      moonAltitudeDeg: alt,
      slantMeters,
      coveragePercent,
      tier: tierForCoverage(coveragePercent),
    });
  }
  return out;
}

/** Sat s najvećom očekivanom siluetom, ili null ako je Mjesec cijeli dan ispod praga. */
export function bestHourOfDay(
  samples: readonly BestHourSample[]
): BestHourSample | null {
  let best: BestHourSample | null = null;
  for (const s of samples) {
    if (s.coveragePercent == null) {
      continue;
    }
    if (best?.coveragePercent == null || s.coveragePercent > best.coveragePercent) {
      best = s;
    }
  }
  return best;
}
