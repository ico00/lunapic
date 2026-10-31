import type { RoutePoint } from "@/lib/db/flightLogDb";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import {
  meanTrackAroundApproach,
  predictApproachesInWindow,
  type MeanTrackSample,
} from "@/lib/domain/flightlog/callsignSchedule";
import {
  callsignPasses,
  createMinuteMoon,
  MAX_SLANT_M,
  MIN_QUALIFYING_SESSIONS,
  MOON_ALTITUDE_PASS_MARGIN_DEG,
  TRACK_OFFSETS_SEC,
  TRACK_STEP_SEC,
  yieldToEventLoop,
} from "@/lib/domain/flightlog/passForecast";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { aircraftAngularSizeDeg, DEFAULT_WINGSPAN_M } from "@/lib/domain/geometry/shotFeasibility";
import { closestApproachOnArc } from "@/lib/domain/geometry/sky-separation";
import { geodeticToEcef } from "@/lib/domain/geometry/wgs84";
import type { MoonPosition } from "@/types";
import type { GroundObserver } from "@/types/geo";

const NEAR_TOL_DEG = 0.5;

export interface TransitCalendarEntry {
  callsign: string;
  /** Predicted moment the mean track comes closest to the Moon. */
  estimateMs: number;
  stdMinutes: number;
  sessionCount: number;
  kind: "transit" | "near";
  minSeparationDeg: number;
  /** Aircraft altitude minus Moon altitude, degrees — same quantity the live
   *  candidate pipeline calls `elevationGapAtAlignmentDeg`. Sign: positive =
   *  aircraft above the Moon. */
  elevationGapDeg: number;
  /** Whether the predicted position falls within the requested camera's
   *  frame if it were pointed at the Moon at that instant — both axes
   *  checked (unlike the live pipeline's elevation-only check, which can
   *  assume azimuth is already aligned; our forecast has no such anchor, so
   *  a large azimuth offset must still exclude it even with a small
   *  elevation gap). */
  inFrame: boolean;
  moonAltDeg: number;
  /** Historical scatter of the callsign's own track at that moment (m). */
  trackSpreadM: number;
  weekdays: number[];
}

/** A candidate that never got close enough for `TransitCalendarEntry.kind` to
 *  apply — same shape, minus `kind`. Returned as `closest` only when
 *  `entries` is empty, so the panel always has *something* to show instead
 *  of a flat "nothing found". */
export type TransitCalendarClosest = Omit<TransitCalendarEntry, "kind">;

type SkySample = MeanTrackSample & {
  readonly altitudeDeg: number;
  readonly azimuthDeg: number;
  readonly slantM: number;
};

function skyTrack(track: readonly MeanTrackSample[], observer: GroundObserver): SkySample[] {
  const pObs = geodeticToEcef(observer.lat, observer.lng, observer.groundHeightMeters);
  const sky: SkySample[] = [];
  for (const sample of track) {
    const pAc = geodeticToEcef(sample.lat, sample.lng, sample.altitudeMeters);
    const slantM = Math.hypot(pAc.x - pObs.x, pAc.y - pObs.y, pAc.z - pObs.z);
    const { altitudeDeg, azimuthDeg } = horizontalToPoint(
      observer,
      sample.lat,
      sample.lng,
      sample.altitudeMeters
    );
    if (slantM <= MAX_SLANT_M && altitudeDeg > 0) {
      sky.push({ ...sample, altitudeDeg, azimuthDeg, slantM });
    }
  }
  return sky;
}

/** Closest the pass comes to the Moon, along the whole track rather than at one point. */
function closestToMoon(
  sky: readonly SkySample[],
  estimateMs: number,
  moonAt: (atMs: number) => MoonPosition
) {
  let best: {
    a: SkySample;
    b: SkySample;
    moon: MoonPosition;
    separationDeg: number;
    fraction: number;
  } | null = null;
  for (let i = 1; i < sky.length; i += 1) {
    const a = sky[i - 1]!;
    const b = sky[i]!;
    if (b.offsetSec - a.offsetSec !== TRACK_STEP_SEC) continue;
    const moon = moonAt(estimateMs + ((a.offsetSec + b.offsetSec) / 2) * 1000);
    if (moon.altitudeDeg < CRITICAL_BELOW_DEG) continue;
    const { separationDeg, fraction } = closestApproachOnArc(a, b, moon);
    if (!best || separationDeg < best.separationDeg) {
      best = { a, b, moon, separationDeg, fraction };
    }
  }
  return best;
}

const lerp = (from: number, to: number, fraction: number) => from + fraction * (to - from);

export type TransitCalendarArgs = {
  readonly observer: GroundObserver;
  readonly nowMs: number;
  readonly toMs: number;
  readonly halfVerticalFovDeg: number;
  readonly halfHorizontalFovDeg: number;
};

/**
 * Forward-looking transit forecast: for callsigns with a regular schedule,
 * predict every closest approach in the window from historical time-of-day
 * statistics, then look for the Moon along the mean track of each pass.
 *
 * This is a statistical forecast, not a geometric guarantee — a schedule that
 * is 5 minutes off moves the Moon 1.25°, more than its whole disk. The live
 * candidate pipeline remains authoritative once a flight is actually airborne
 * that day.
 */
export async function forecastTransitCalendar(
  sessionsByCallsign: ReadonlyMap<string, RoutePoint[][]>,
  { observer, nowMs, toMs, halfVerticalFovDeg, halfHorizontalFovDeg }: TransitCalendarArgs
): Promise<{ entries: TransitCalendarEntry[]; closest: TransitCalendarClosest[] }> {
  const moonAt = createMinuteMoon(observer);
  const evaluated: (TransitCalendarClosest & { kind: TransitCalendarEntry["kind"] | "far" })[] = [];

  let callsignIndex = 0;
  for (const [callsign, sessions] of sessionsByCallsign) {
    await yieldToEventLoop(callsignIndex);
    callsignIndex += 1;

    const { approaches, anchored } = callsignPasses(sessions, observer);
    if (approaches.length < MIN_QUALIFYING_SESSIONS) continue;

    const prediction = predictApproachesInWindow(approaches, nowMs, toMs);
    if (!prediction) continue;

    const sky = skyTrack(
      meanTrackAroundApproach(anchored, TRACK_OFFSETS_SEC, MIN_QUALIFYING_SESSIONS),
      observer
    );
    if (sky.length < 2) continue;

    for (const estimateMs of prediction.estimatesMs) {
      if (moonAt(estimateMs).altitudeDeg < CRITICAL_BELOW_DEG - MOON_ALTITUDE_PASS_MARGIN_DEG) {
        continue;
      }
      const best = closestToMoon(sky, estimateMs, moonAt);
      if (!best) continue;

      const { a, b, moon, separationDeg, fraction } = best;
      const elevationGapDeg = lerp(a.altitudeDeg, b.altitudeDeg, fraction) - moon.altitudeDeg;
      // Pythagorean split of the already-correct spherical separation into a
      // vertical (elevationGapDeg) and horizontal component — avoids a second,
      // less accurate azimuth-difference-with-cosine-correction calculation.
      const horizontalOffsetDeg = Math.sqrt(
        Math.max(0, separationDeg * separationDeg - elevationGapDeg * elevationGapDeg)
      );
      const acRadiusDeg =
        aircraftAngularSizeDeg(DEFAULT_WINGSPAN_M, lerp(a.slantM, b.slantM, fraction)) / 2;
      evaluated.push({
        callsign,
        estimateMs: estimateMs + lerp(a.offsetSec, b.offsetSec, fraction) * 1000,
        stdMinutes: prediction.stdMinutes,
        sessionCount: approaches.length,
        kind:
          separationDeg <= moon.apparentRadius.degrees + acRadiusDeg
            ? "transit"
            : separationDeg <= NEAR_TOL_DEG
              ? "near"
              : "far",
        minSeparationDeg: Number(separationDeg.toFixed(3)),
        elevationGapDeg: Number(elevationGapDeg.toFixed(3)),
        inFrame:
          Math.abs(elevationGapDeg) <= halfVerticalFovDeg &&
          horizontalOffsetDeg <= halfHorizontalFovDeg,
        moonAltDeg: Number(moon.altitudeDeg.toFixed(1)),
        trackSpreadM: Math.round(lerp(a.spreadMeters, b.spreadMeters, fraction)),
        weekdays: prediction.weekdays,
      });
    }
  }

  const entries = evaluated
    .filter((c): c is TransitCalendarEntry => c.kind !== "far")
    .sort((a, b) => a.estimateMs - b.estimateMs);

  // Ranked by true angular separation from the Moon — the honest single
  // distance metric. `inFrame` (both-axes check) decides the badge, not the
  // ranking, so a candidate that's vertically close but azimuthally far
  // doesn't crowd out one that's genuinely nearer overall.
  const closest: TransitCalendarClosest[] =
    entries.length === 0
      ? [...evaluated]
          .sort((a, b) => a.minSeparationDeg - b.minSeparationDeg)
          .slice(0, 3)
          .map(({ kind: _kind, ...rest }) => rest)
      : [];

  return { entries, closest };
}
