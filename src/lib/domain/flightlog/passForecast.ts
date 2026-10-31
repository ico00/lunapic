import type { RoutePoint } from "@/lib/db/flightLogDb";
import { getMoonPosition } from "@/lib/domain/astro/moon";
import {
  closestApproachInSession,
  type AnchoredSession,
  type ClosestApproach,
} from "@/lib/domain/flightlog/callsignSchedule";
import { geodeticToEcef } from "@/lib/domain/geometry/wgs84";
import type { MoonPosition } from "@/types";
import type { GroundObserver } from "@/types/geo";

/** Dijele `transit-calendar` i `photo-spots`: isti raspored, isti prozor putanje. */

export const MAX_SLANT_M = 100_000;
/** Below this, a callsign's historical passes are too sparse to trust a schedule. */
export const MIN_QUALIFYING_SESSIONS = 3;
/** Track window around the predicted closest approach, and its sampling step. */
export const TRACK_HALF_WINDOW_SEC = 300;
export const TRACK_STEP_SEC = 15;

export const TRACK_OFFSETS_SEC: readonly number[] = Array.from(
  { length: (2 * TRACK_HALF_WINDOW_SEC) / TRACK_STEP_SEC + 1 },
  (_, i) => -TRACK_HALF_WINDOW_SEC + i * TRACK_STEP_SEC
);

/**
 * Mjesec se tijekom ±300 s pomakne do ~1.25°, pa prolaz čiji je Mjesec u
 * predviđenom trenutku ovoliko ispod praga sigurno ostaje ispod njega.
 */
export const MOON_ALTITUDE_PASS_MARGIN_DEG = 1.5;

const YIELD_EVERY_CALLSIGNS = 100;

export function callsignPasses(
  sessions: readonly RoutePoint[][],
  observer: GroundObserver
): { approaches: ClosestApproach[]; anchored: AnchoredSession[] } {
  const pObs = geodeticToEcef(observer.lat, observer.lng, observer.groundHeightMeters);
  const approaches: ClosestApproach[] = [];
  const anchored: AnchoredSession[] = [];
  for (const session of sessions) {
    const approach = closestApproachInSession(session, pObs, MAX_SLANT_M);
    if (!approach) continue;
    approaches.push(approach);
    anchored.push({ points: session, anchorMs: approach.timeMs });
  }
  return { approaches, anchored };
}

/**
 * Mjesec po minuti za jednog promatrača. Točnost od ±30 s (najviše 0.125°) je
 * ovdje dovoljna jer raspored griješi za minute, a jedna prognoza pita Mjesec
 * stotine tisuća puta. Za precizne solvere vidi `createMoonStateCache`.
 */
export function createMinuteMoon(observer: GroundObserver): (atMs: number) => MoonPosition {
  const byMinute = new Map<number, MoonPosition>();
  return (atMs) => {
    const minute = Math.round(atMs / 60_000) * 60_000;
    let moon = byMinute.get(minute);
    if (!moon) {
      moon = getMoonPosition(new Date(minute), observer.lat, observer.lng, observer.groundHeightMeters);
      byMinute.set(minute, moon);
    }
    return moon;
  };
}

/**
 * Prepusti event loop svakih nekoliko pozivnih znakova. Prognoza traje sekundama,
 * a isti proces vrti i flight-log poller i server-side scan.
 */
export async function yieldToEventLoop(callsignIndex: number): Promise<void> {
  if (callsignIndex % YIELD_EVERY_CALLSIGNS === YIELD_EVERY_CALLSIGNS - 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
