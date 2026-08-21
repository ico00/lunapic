/**
 * "Stand here" forecast shapes, shared by `/api/flight-log/photo-spots`, the
 * Flight log panel and the map layer that draws the result.
 *
 * Unlike the live candidate pipeline, an opportunity is a **place plus an
 * instant**: the ground point that puts a scheduled flight on the Moon's disk,
 * and the moment its shadow passes through that point.
 */

export type PhotoSpotConfidence = "high" | "medium" | "low";

export interface PhotoSpotOpportunity {
  callsign: string;
  /** Predicted instant of the transit itself (not of the closest approach). */
  atMs: number;
  /** Circular std of the callsign's time-of-day, minutes. */
  stdMinutes: number;
  /** Historical passes the schedule fit is based on. */
  sessionCount: number;
  /** Of those, how many actually contributed a position to the chosen instant. */
  trackSessionCount: number;
  /** UTC weekdays (0 = Sun) the callsign was observed on. */
  weekdays: number[];
  /** Stand here. */
  lat: number;
  lng: number;
  distanceFromObserverM: number;
  bearingFromObserverDeg: number;
  /** Aircraft width as a percent of the Moon's diameter, from this spot. */
  coveragePercent: number;
  slantKm: number;
  moonAltDeg: number;
  moonAzDeg: number;
  /** Sideways slack, perpendicular to the Moon's azimuth (m). The tight axis. */
  crossTrackToleranceM: number;
  /** Slack toward/away from the Moon (m) — looser by `1 / sin(moonAlt)`. */
  alongTrackToleranceM: number;
  /**
   * Historical scatter of the callsign's own track (m). The honest error bar:
   * when it dwarfs `crossTrackToleranceM`, this names a neighbourhood rather
   * than a parking spot.
   */
  trackSpreadM: number;
  confidence: PhotoSpotConfidence;
  /** Ground track of the moving spot: `[lng, lat, secondsFromAtMs]`. */
  path: [number, number, number][];
}

export interface PhotoSpotsResponse {
  spots: PhotoSpotOpportunity[];
  /** Nearest near-misses, only when `spots` is empty. */
  closest: PhotoSpotOpportunity[];
  /**
   * Best coverage any evaluated pass could reach from anywhere on the ground.
   * Coverage is capped by altitude (`wingspan · sin(moonAlt) / height`), so an
   * empty list at a 50 % threshold is a fact about the sky, not a bug.
   */
  bestCoveragePercent: number;
  historyDays: number;
  forecastDays: number;
  maxSpotKm: number;
  minCoveragePercent: number;
  maxSpreadKm: number;
}
