import { NextRequest, NextResponse } from "next/server";
import { dbVersionKey, getAllCallsignSessions, type RoutePoint } from "@/lib/db/flightLogDb";
import { createMoonStateCache } from "@/lib/domain/astro/moonStateCache";
import {
  closestApproachInSession,
  meanTrackAroundApproach,
  predictNextApproach,
  type AnchoredSession,
  type ClosestApproach,
} from "@/lib/domain/flightlog/callsignSchedule";
import {
  solveMoonShadowSpot,
  type MoonShadowSpot,
} from "@/lib/domain/geometry/moonShadowSpot";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import { geodeticToEcef, initialBearingDeg } from "@/lib/domain/geometry/wgs84";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import type {
  PhotoSpotConfidence,
  PhotoSpotOpportunity,
} from "@/types/photoSpot";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json" };

/**
 * "Where do I stand?" forecast — the inverse of `transit-calendar`.
 *
 * `transit-calendar` fixes the observer and asks which scheduled callsign will
 * happen to pass across the Moon *from the balcony*. This route drops that
 * constraint: for every callsign with a regular schedule it solves the ground
 * point from which the aircraft would sit on the Moon's disk
 * (`solveMoonShadowSpot`), and reports the ones close enough to drive to.
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
 */

const DAY_MS = 86_400_000;
const MAX_SLANT_M = 100_000;
/** Below this, a callsign's historical passes are too sparse to trust a schedule. */
const MIN_QUALIFYING_SESSIONS = 3;
/** Track window around the predicted closest approach, and its sampling step. */
const TRACK_HALF_WINDOW_SEC = 300;
const TRACK_STEP_SEC = 15;
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

const TRACK_OFFSETS_SEC: number[] = [];
for (let t = -TRACK_HALF_WINDOW_SEC; t <= TRACK_HALF_WINDOW_SEC; t += TRACK_STEP_SEC) {
  TRACK_OFFSETS_SEC.push(t);
}

interface Evaluated {
  opportunity: PhotoSpotOpportunity;
  /** Whether it cleared both the distance and the coverage filter. */
  qualifies: boolean;
}

function confidenceFor(
  trackSpreadM: number,
  crossTrackToleranceM: number,
  stdMinutes: number
): PhotoSpotConfidence {
  if (trackSpreadM > 5 * crossTrackToleranceM || stdMinutes > 15) return "low";
  if (trackSpreadM > crossTrackToleranceM || stdMinutes > 5) return "medium";
  return "high";
}

const bodyCache = createTtlBodyCache(15 * 60_000, 8);

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 10, 60_000, "flight-log/photo-spots");
  if (reject) return reject;

  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") ?? "");
  const lng = parseFloat(sp.get("lng") ?? "");
  const heightM = parseFloat(sp.get("heightM") ?? "0");
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Invalid observer" }, { status: 400, headers: NO_CACHE });
  }
  const groundHeightMeters = isFinite(heightM) ? heightM : 0;

  const historyDays = Math.min(Math.max(parseFloat(sp.get("historyDays") ?? "30"), 1), 90);
  const forecastDays = Math.min(Math.max(parseFloat(sp.get("forecastDays") ?? "14"), 1), 30);
  /** How far the photographer is willing to travel. */
  const maxSpotKm = Math.min(Math.max(parseFloat(sp.get("maxSpotKm") ?? "25"), 0.5), 100);
  const minCoveragePercent = Math.min(
    Math.max(parseFloat(sp.get("minCoveragePercent") ?? "10"), 1),
    60
  );
  /**
   * Historical scatter above which a "spot" stops being a spot. The transit
   * tolerance is ~100 m across; a callsign whose own track wanders kilometres
   * between passes cannot be aimed at, however good the geometry looks.
   */
  const maxSpreadM =
    Math.min(Math.max(parseFloat(sp.get("maxSpreadKm") ?? "2.5"), 0.1), 20) * 1000;

  const cacheKey = [
    dbVersionKey(),
    lat.toFixed(3),
    lng.toFixed(3),
    groundHeightMeters,
    historyDays,
    forecastDays,
    maxSpotKm,
    minCoveragePercent,
    maxSpreadM,
  ].join("|");
  const cached = bodyCache.get(cacheKey);
  if (cached) return new NextResponse(cached, { headers: JSON_HEADERS });

  const nowMs = Date.now();
  const fromMs = nowMs - historyDays * DAY_MS;
  const toMs = nowMs + forecastDays * DAY_MS;

  let sessionsByCallsign: Map<string, RoutePoint[][]>;
  try {
    sessionsByCallsign = await getAllCallsignSessions(fromMs, nowMs);
  } catch (e) {
    console.error("[flight-log/photo-spots]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_CACHE });
  }

  // ECEF observer for the closest-approach screen (same 100 km gate the live
  // pipeline and transit-calendar use).
  const pObs = geodeticToEcef(lat, lng, groundHeightMeters);
  const moonAt = createMoonStateCache();
  const maxSpotM = maxSpotKm * 1000;

  const evaluated: Evaluated[] = [];
  let bestCoveragePercent = 0;

  for (const [callsign, sessions] of sessionsByCallsign) {
    const anchored: AnchoredSession[] = [];
    const approaches: ClosestApproach[] = [];
    for (const session of sessions) {
      const ca = closestApproachInSession(session, pObs, MAX_SLANT_M);
      if (!ca) continue;
      approaches.push(ca);
      anchored.push({ points: session, anchorMs: ca.timeMs });
    }
    if (approaches.length < MIN_QUALIFYING_SESSIONS) continue;

    const prediction = predictNextApproach(approaches, nowMs);
    if (!prediction || prediction.estimateMs > toMs) continue;

    const meanTrack = meanTrackAroundApproach(
      anchored,
      TRACK_OFFSETS_SEC,
      MIN_QUALIFYING_SESSIONS
    );
    if (meanTrack.length < 2) continue;

    // Solve the shadow spot for every sampled instant of the predicted pass.
    const solved: {
      offsetSec: number;
      spot: MoonShadowSpot;
      spreadMeters: number;
      trackSessionCount: number;
    }[] = [];
    for (const sample of meanTrack) {
      if (sample.altitudeMeters - groundHeightMeters < MIN_AIRCRAFT_AGL_M) continue;
      const atMs = prediction.estimateMs + sample.offsetSec * 1000;
      const spot = solveMoonShadowSpot({
        aircraftLat: sample.lat,
        aircraftLng: sample.lng,
        aircraftAltitudeMeters: sample.altitudeMeters,
        atMs,
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
    if (solved.length < MIN_SOLVED_SAMPLES) continue;

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
    if (!chosen) continue;
    const distanceM = best ? bestDistanceM : nearestDistanceM;
    // Tracked over *every* solved sample, reachable or not: this is the ceiling
    // the sky imposes tonight, which is what explains an empty result list.
    for (const s of solved) {
      bestCoveragePercent = Math.max(bestCoveragePercent, s.spot.coveragePercent);
    }

    const atMs = prediction.estimateMs + chosen.offsetSec * 1000;
    const opportunity: PhotoSpotOpportunity = {
      callsign,
      atMs,
      stdMinutes: prediction.stdMinutes,
      sessionCount: approaches.length,
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

    evaluated.push({
      opportunity,
      qualifies:
        best != null &&
        opportunity.coveragePercent >= minCoveragePercent &&
        chosen.spreadMeters <= maxSpreadM,
    });
  }

  const spots = evaluated
    .filter((e) => e.qualifies)
    .map((e) => e.opportunity)
    .sort((a, b) => a.atMs - b.atMs);

  // Same fallback contract as transit-calendar: when nothing qualifies, show
  // the three best near-misses so the panel explains *why* instead of going blank.
  const closest =
    spots.length === 0
      ? evaluated
          .map((e) => e.opportunity)
          .sort((a, b) => a.distanceFromObserverM - b.distanceFromObserverM)
          .slice(0, 3)
      : [];

  const body = JSON.stringify({
    spots,
    closest,
    bestCoveragePercent: Number(bestCoveragePercent.toFixed(1)),
    historyDays,
    forecastDays,
    maxSpotKm,
    minCoveragePercent,
    maxSpreadKm: maxSpreadM / 1000,
  });
  bodyCache.set(cacheKey, body);
  return new NextResponse(body, { headers: JSON_HEADERS });
}
