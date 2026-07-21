import { NextRequest, NextResponse } from "next/server";
import { getCallsignSessions, type RoutePoint } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };
const EMPTY_FC = { type: "FeatureCollection", features: [] };

const MEAN_SAMPLES = 80;

const DAY_MS = 86_400_000;

export interface NextPassPrediction {
  /** Predicted epoch ms of the next pass (UTC). */
  estimateMs: number;
  /** Circular std of time-of-day across sessions, minutes. */
  stdMinutes: number;
  /** Number of sessions the prediction is based on. */
  sessionCount: number;
  /** UTC weekdays (0=Sun..6=Sat) on which this callsign was observed. */
  weekdays: number[];
}

/** Min / median / max barometric altitude over all session points, metres. */
function computeAltitudeSummary(
  sessions: RoutePoint[][]
): { minM: number; medianM: number; maxM: number } | null {
  const alts: number[] = [];
  for (const s of sessions) {
    for (const p of s) {
      if (p.alt_baro_m != null) alts.push(p.alt_baro_m);
    }
  }
  if (alts.length === 0) return null;
  alts.sort((a, b) => a - b);
  return {
    minM: Math.round(alts[0]),
    medianM: Math.round(alts[Math.floor(alts.length / 2)]),
    maxM: Math.round(alts[alts.length - 1]),
  };
}

/**
 * Predict the next pass from session mid-times using circular statistics on
 * time-of-day. Airline schedules repeat daily/weekly, so the circular mean of
 * time-of-day is a robust estimator even with missed days in between.
 */
function computeNextPass(sessions: RoutePoint[][], nowMs: number): NextPassPrediction | null {
  if (sessions.length < 2) return null;

  const midTimes = sessions.map((s) => (s[0].logged_at + s[s.length - 1].logged_at) / 2);

  // Circular mean of time-of-day (UTC)
  let sx = 0, sy = 0;
  for (const t of midTimes) {
    const angle = ((t % DAY_MS) / DAY_MS) * 2 * Math.PI;
    sx += Math.cos(angle);
    sy += Math.sin(angle);
  }
  const n = midTimes.length;
  const R = Math.sqrt(sx * sx + sy * sy) / n;
  if (R < 0.5) return null; // times scattered across the day — not a regular schedule

  const meanAngle = Math.atan2(sy, sx);
  const meanDayMs = (((meanAngle / (2 * Math.PI)) * DAY_MS) + DAY_MS) % DAY_MS;
  const stdMinutes = Math.sqrt(-2 * Math.log(R)) * (1440 / (2 * Math.PI));

  const weekdays = [...new Set(midTimes.map((t) => new Date(t).getUTCDay()))].sort();
  // Weekday filter only when we have enough sessions to trust the pattern
  const useWeekdays = n >= 4 && weekdays.length < 7;

  // Next occurrence of meanDayMs after now (search up to 8 days ahead)
  const todayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  for (let d = 0; d < 8; d++) {
    const candidate = todayStart + d * DAY_MS + meanDayMs;
    if (candidate <= nowMs) continue;
    if (useWeekdays && !weekdays.includes(new Date(candidate).getUTCDay())) continue;
    return { estimateMs: candidate, stdMinutes: Math.round(stdMinutes), sessionCount: n, weekdays };
  }
  return null;
}

/**
 * Resample a session to exactly n evenly-spaced points by cumulative path length.
 * This ensures point i of one session corresponds to the same fraction of the
 * journey as point i of every other session, making element-wise averaging valid.
 */
function resampleSession(pts: RoutePoint[], n: number): [number, number][] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array(n).fill([pts[0].lng, pts[0].lat] as [number, number]);

  const dists: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].lng - pts[i - 1].lng;
    const dy = pts[i].lat - pts[i - 1].lat;
    dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = dists[dists.length - 1];
  if (total === 0) return Array(n).fill([pts[0].lng, pts[0].lat] as [number, number]);

  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let j = 1;
    while (j < dists.length - 1 && dists[j] < target) j++;
    const frac = (target - dists[j - 1]) / (dists[j] - dists[j - 1]);
    out.push([
      pts[j - 1].lng + frac * (pts[j].lng - pts[j - 1].lng),
      pts[j - 1].lat + frac * (pts[j].lat - pts[j - 1].lat),
    ]);
  }
  return out;
}

/**
 * Compute a mean-path LineString from N flight sessions.
 *
 * Algorithm: resample every session to MEAN_SAMPLES points equally spaced by
 * path length, align direction relative to the first session, then take the
 * element-wise coordinate mean. The result is a smooth curve through the
 * middle of all sessions — no binning artefacts at bends or turns.
 */
function computeMeanPath(sessions: RoutePoint[][]): [number, number][] {
  if (sessions.length === 0) return [];

  const resampled = sessions.map((s) => resampleSession(s, MEAN_SAMPLES));
  const ref = resampled[0];

  // Align direction: if a session's start is closer to the reference's end
  // than to its start, it was logged in the opposite direction — flip it.
  const refStart = ref[0];
  const refEnd = ref[MEAN_SAMPLES - 1];
  const aligned = resampled.map((s) => {
    const dStart = Math.hypot(s[0][0] - refStart[0], s[0][1] - refStart[1]);
    const dEnd   = Math.hypot(s[0][0] - refEnd[0],   s[0][1] - refEnd[1]);
    return dEnd < dStart ? [...s].reverse() as [number, number][] : s;
  });

  // Element-wise mean
  const mean: [number, number][] = [];
  for (let i = 0; i < MEAN_SAMPLES; i++) {
    let lng = 0, lat = 0;
    for (const s of aligned) { lng += s[i][0]; lat += s[i][1]; }
    mean.push([lng / aligned.length, lat / aligned.length]);
  }
  return mean;
}

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 20, 60_000, "flight-log/callsign-analysis");
  if (reject) return reject;

  const sp = req.nextUrl.searchParams;
  const callsign = (sp.get("callsign") ?? "").trim().toUpperCase().slice(0, 10);
  if (!callsign || !/^[A-Z0-9]{2,10}$/.test(callsign)) {
    return NextResponse.json({ error: "Invalid callsign" }, { status: 400, headers: NO_CACHE });
  }

  const days = Math.min(Math.max(parseFloat(sp.get("days") ?? "30"), 1), 90);
  const toMs = Date.now();
  const fromMs = toMs - days * 86_400_000;

  let sessions: RoutePoint[][];
  try {
    sessions = await getCallsignSessions(callsign, fromMs, toMs);
  } catch (e) {
    console.error("[flight-log/callsign-analysis]", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_CACHE }
    );
  }

  if (sessions.length === 0) {
    return NextResponse.json(
      { sessions: EMPTY_FC, mean: EMPTY_FC, sessionCount: 0, nextPass: null, altitude: null },
      { headers: NO_CACHE }
    );
  }

  // Build GeoJSON for individual sessions
  const sessionFeatures = sessions.map((pts, i) => ({
    type: "Feature",
    properties: { sessionIndex: i, pointCount: pts.length },
    geometry: {
      type: "LineString",
      coordinates: pts.map((p) => [p.lng, p.lat, p.alt_baro_m ?? 0]),
    },
  }));

  // Build GeoJSON for mean path
  const meanCoords = computeMeanPath(sessions);
  const meanFeatures =
    meanCoords.length >= 2
      ? [
          {
            type: "Feature",
            properties: { sessionCount: sessions.length },
            geometry: { type: "LineString", coordinates: meanCoords },
          },
        ]
      : [];

  return NextResponse.json(
    {
      sessions: { type: "FeatureCollection", features: sessionFeatures },
      mean: { type: "FeatureCollection", features: meanFeatures },
      sessionCount: sessions.length,
      nextPass: computeNextPass(sessions, Date.now()),
      altitude: computeAltitudeSummary(sessions),
    },
    { headers: NO_CACHE }
  );
}
