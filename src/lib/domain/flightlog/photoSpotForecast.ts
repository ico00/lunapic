import type { RoutePoint } from "@/lib/db/flightLogDb";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { createMoonStateCache } from "@/lib/domain/astro/moonStateCache";
import {
  meanTrackAroundApproach,
  predictApproachesInWindow,
  type MeanTrackSample,
  type PredictedApproaches,
} from "@/lib/domain/flightlog/callsignSchedule";
import {
  callsignPasses,
  createMinuteMoon,
  MIN_QUALIFYING_SESSIONS,
  MOON_ALTITUDE_PASS_MARGIN_DEG,
  TRACK_OFFSETS_SEC,
  yieldToEventLoop,
} from "@/lib/domain/flightlog/passForecast";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import {
  maxCoveragePercentForAltitude,
  solveMoonShadowSpot,
  type MoonShadowSpot,
} from "@/lib/domain/geometry/moonShadowSpot";
import { destinationByAzimuthMeters, initialBearingDeg, toRad } from "@/lib/domain/geometry/wgs84";
import type { GroundObserver } from "@/types/geo";
import type {
  PhotoSpotConfidence,
  PhotoSpotOpportunity,
  PhotoSpotsResponse,
} from "@/types/photoSpot";

/**
 * Ignore samples below this height above the assumed ground. Landing and
 * taxiing traffic reports altitudes down to field elevation, where the flat
 * ground assumption (no terrain model) dominates the answer and the "spot"
 * would be metres from a runway. It also filters the pathological cases —
 * a 40 m aircraft 200 m up covers six Moon diameters, which is not a transit.
 */
const MIN_AIRCRAFT_AGL_M = 300;
/** A pass needs this many solved samples before its shadow path means anything. */
const MIN_SOLVED_SAMPLES = 5;
/**
 * Predfiltar ravne Zemlje mora ostati na sigurnoj strani: sfera pomiče sjenu za
 * ~`d³ / 2R·h`, što je pri niskom Mjesecu (d ≈ 100 km) desetak posto od `d`.
 */
const FLAT_SHADOW_ERROR_FRACTION = 0.25;
const FLAT_SHADOW_ERROR_MIN_M = 3000;
const NEAR_MISS_COUNT = 3;
/** Svaki rezultat nosi cijelu putanju, a u 14 dana ih zna biti više od tisuću. */
const MAX_SPOTS = 100;

function confidenceFor(
  trackSpreadM: number,
  crossTrackToleranceM: number,
  stdMinutes: number
): PhotoSpotConfidence {
  if (trackSpreadM > 5 * crossTrackToleranceM || stdMinutes > 15) return "low";
  if (trackSpreadM > crossTrackToleranceM || stdMinutes > 5) return "medium";
  return "high";
}

type Pass = {
  readonly callsign: string;
  readonly prediction: PredictedApproaches;
  readonly estimateMs: number;
  readonly sessionCount: number;
  readonly track: readonly MeanTrackSample[];
};

type Evaluated = {
  opportunity: PhotoSpotOpportunity;
  /** Whether it cleared both the distance and the coverage filter. */
  qualifies: boolean;
};

export type PhotoSpotForecastArgs = {
  readonly observer: GroundObserver;
  readonly nowMs: number;
  readonly toMs: number;
  readonly maxSpotM: number;
  readonly minCoveragePercent: number;
  readonly maxSpreadM: number;
};

export type PhotoSpotForecast = Pick<
  PhotoSpotsResponse,
  "spots" | "matchedSpotCount" | "closest" | "bestCoveragePercent"
>;

/**
 * "Where do I stand?" forecast: for every pass of a callsign with a regular
 * schedule it solves the ground point from which the aircraft would sit on the
 * Moon's disk (`solveMoonShadowSpot`), and reports the ones close enough to
 * drive to.
 *
 * The spot is not static. It sweeps the ground at the aircraft's own ground
 * speed (~200 m/s), so each opportunity carries the whole **shadow path** for
 * its pass — a line with a time on every vertex — instead of a single pin.
 * What makes it usable at all is the lead time: the schedule forecast is hours
 * out, so there is time to actually travel, unlike the live pipeline's 5-minute
 * dead-reckoning horizon.
 *
 * Two honesty rails, because the geometry is unforgiving:
 *  - `coveragePercent` is bounded by altitude (`wingspan · sin(moonAlt) / h`).
 *    A 40 m airliner at cruise cannot fill half a Moon from anywhere on Earth,
 *    so `bestCoveragePercent` is always returned — an empty list at a 50 %
 *    threshold is a fact about the sky, not a missing feature.
 *  - `trackSpreadMeters` is the historical scatter of the callsign's own track.
 *    When it dwarfs `crossTrackToleranceMeters` (~100 m), the forecast is
 *    naming a neighbourhood, not a parking spot.
 *
 * Svaki dan prozora je zaseban prolaz, a solver je skup, pa ravna procjena sjene
 * prvo odbaci prolaze čija sjena ne prolazi blizu promatrača (vidi `flatPassLook`).
 */
export async function forecastPhotoSpots(
  sessionsByCallsign: ReadonlyMap<string, RoutePoint[][]>,
  { observer, nowMs, toMs, maxSpotM, minCoveragePercent, maxSpreadM }: PhotoSpotForecastArgs
): Promise<PhotoSpotForecast> {
  const { lat, lng, groundHeightMeters } = observer;
  const moonAtMinute = createMinuteMoon(observer);
  const moonAt = createMoonStateCache();

  /** Cheap look at a pass: nearest flat-Earth shadow, and the coverage ceiling. */
  const flatPassLook = ({ track, estimateMs }: Pass) => {
    let nearestM = Infinity;
    let reachable = false;
    let coveragePercent = 0;
    for (const sample of track) {
      const heightM = sample.altitudeMeters - groundHeightMeters;
      if (heightM < MIN_AIRCRAFT_AGL_M) continue;
      const moon = moonAtMinute(estimateMs + sample.offsetSec * 1000);
      if (moon.altitudeDeg < CRITICAL_BELOW_DEG) continue;
      coveragePercent = Math.max(
        coveragePercent,
        maxCoveragePercentForAltitude(heightM, moon.altitudeDeg)
      );
      const shadowM = heightM / Math.tan(toRad(moon.altitudeDeg));
      const shadow = destinationByAzimuthMeters(
        sample.lat,
        sample.lng,
        (moon.azimuthDeg + 180) % 360,
        shadowM
      );
      const distanceM = greatCircleDistanceMeters(lat, lng, shadow.lat, shadow.lng);
      nearestM = Math.min(nearestM, distanceM);
      const errorM = Math.max(FLAT_SHADOW_ERROR_MIN_M, FLAT_SHADOW_ERROR_FRACTION * shadowM);
      reachable ||= distanceM <= maxSpotM + errorM;
    }
    return { nearestM, reachable, coveragePercent };
  };

  const solvePass = ({ callsign, prediction, estimateMs, sessionCount, track }: Pass): Evaluated | null => {
    // Solve the shadow spot for every sampled instant of the predicted pass.
    const solved: {
      offsetSec: number;
      spot: MoonShadowSpot;
      spreadMeters: number;
      trackSessionCount: number;
    }[] = [];
    for (const sample of track) {
      if (sample.altitudeMeters - groundHeightMeters < MIN_AIRCRAFT_AGL_M) continue;
      const spot = solveMoonShadowSpot({
        aircraftLat: sample.lat,
        aircraftLng: sample.lng,
        aircraftAltitudeMeters: sample.altitudeMeters,
        atMs: estimateMs + sample.offsetSec * 1000,
        groundHeightMeters,
        moonAt,
      });
      if (spot) {
        solved.push({
          offsetSec: sample.offsetSec,
          spot,
          spreadMeters: sample.spreadMeters,
          trackSessionCount: sample.sessionCount,
        });
      }
    }
    if (solved.length < MIN_SOLVED_SAMPLES) return null;

    // Pick the reachable sample with the biggest aircraft-on-Moon; fall back to
    // the nearest one so the panel can still explain how far off it was.
    let best: (typeof solved)[number] | null = null;
    let bestDistanceM = Infinity;
    let nearest: (typeof solved)[number] | null = null;
    let nearestDistanceM = Infinity;
    for (const s of solved) {
      const distanceM = greatCircleDistanceMeters(lat, lng, s.spot.lat, s.spot.lng);
      if (distanceM < nearestDistanceM) {
        nearestDistanceM = distanceM;
        nearest = s;
      }
      if (distanceM > maxSpotM) continue;
      if (!best || s.spot.coveragePercent > best.spot.coveragePercent) {
        best = s;
        bestDistanceM = distanceM;
      }
    }

    const chosen = best ?? nearest;
    if (!chosen) return null;
    const distanceM = best ? bestDistanceM : nearestDistanceM;

    const opportunity: PhotoSpotOpportunity = {
      callsign,
      atMs: estimateMs + chosen.offsetSec * 1000,
      stdMinutes: prediction.stdMinutes,
      sessionCount,
      trackSessionCount: chosen.trackSessionCount,
      weekdays: prediction.weekdays,
      lat: Number(chosen.spot.lat.toFixed(6)),
      lng: Number(chosen.spot.lng.toFixed(6)),
      distanceFromObserverM: Math.round(distanceM),
      bearingFromObserverDeg: Math.round(
        initialBearingDeg([lat, lng], [chosen.spot.lat, chosen.spot.lng])
      ),
      coveragePercent: Number(chosen.spot.coveragePercent.toFixed(1)),
      slantKm: Number((chosen.spot.slantRangeMeters / 1000).toFixed(1)),
      moonAltDeg: Number(chosen.spot.moonAltitudeDeg.toFixed(1)),
      moonAzDeg: Number(chosen.spot.moonAzimuthDeg.toFixed(1)),
      crossTrackToleranceM: Math.round(chosen.spot.crossTrackToleranceMeters),
      alongTrackToleranceM: Math.round(chosen.spot.alongTrackToleranceMeters),
      trackSpreadM: Math.round(chosen.spreadMeters),
      confidence: confidenceFor(
        chosen.spreadMeters,
        chosen.spot.crossTrackToleranceMeters,
        prediction.stdMinutes
      ),
      path: solved.map((s) => [
        Number(s.spot.lng.toFixed(6)),
        Number(s.spot.lat.toFixed(6)),
        s.offsetSec - chosen.offsetSec,
      ]),
    };
    return {
      opportunity,
      qualifies:
        best != null &&
        opportunity.coveragePercent >= minCoveragePercent &&
        chosen.spreadMeters <= maxSpreadM,
    };
  };

  const evaluated: Evaluated[] = [];
  const nearMisses: { pass: Pass; nearestM: number }[] = [];
  let bestCoveragePercent = 0;

  let callsignIndex = 0;
  for (const [callsign, sessions] of sessionsByCallsign) {
    await yieldToEventLoop(callsignIndex);
    callsignIndex += 1;

    const { approaches, anchored } = callsignPasses(sessions, observer);
    if (approaches.length < MIN_QUALIFYING_SESSIONS) continue;

    const prediction = predictApproachesInWindow(approaches, nowMs, toMs);
    if (!prediction) continue;

    const track = meanTrackAroundApproach(anchored, TRACK_OFFSETS_SEC, MIN_QUALIFYING_SESSIONS);
    if (track.length < 2) continue;

    for (const estimateMs of prediction.estimatesMs) {
      if (moonAtMinute(estimateMs).altitudeDeg < CRITICAL_BELOW_DEG - MOON_ALTITUDE_PASS_MARGIN_DEG) {
        continue;
      }
      const pass: Pass = { callsign, prediction, estimateMs, sessionCount: approaches.length, track };
      const look = flatPassLook(pass);
      // The ceiling the sky imposes, reachable or not: this is what explains an
      // empty result list.
      bestCoveragePercent = Math.max(bestCoveragePercent, look.coveragePercent);
      if (look.reachable) {
        const result = solvePass(pass);
        if (result) evaluated.push(result);
      } else if (look.nearestM < Infinity) {
        nearMisses.push({ pass, nearestM: look.nearestM });
      }
    }
  }

  const matched = evaluated.filter((e) => e.qualifies).map((e) => e.opportunity);
  // Rezanje po vremenu bi opet sakrilo kasnije dane, pa ostaju najveći avioni.
  const spots = [...matched]
    .sort((a, b) => b.coveragePercent - a.coveragePercent)
    .slice(0, MAX_SPOTS)
    .sort((a, b) => a.atMs - b.atMs);

  // When nothing qualifies, show
  // the three best near-misses so the panel explains *why* instead of going blank.
  const closest: PhotoSpotOpportunity[] = [];
  if (spots.length === 0) {
    const nearestPasses = nearMisses.sort((a, b) => a.nearestM - b.nearestM).slice(0, NEAR_MISS_COUNT);
    for (const { pass } of nearestPasses) {
      const result = solvePass(pass);
      if (result) evaluated.push(result);
    }
    closest.push(
      ...evaluated
        .map((e) => e.opportunity)
        .sort((a, b) => a.distanceFromObserverM - b.distanceFromObserverM)
        .slice(0, NEAR_MISS_COUNT)
    );
  }

  return {
    spots,
    matchedSpotCount: matched.length,
    closest,
    bestCoveragePercent: Number(bestCoveragePercent.toFixed(1)),
  };
}
