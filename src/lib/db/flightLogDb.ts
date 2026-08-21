/**
 * node-sqlite3-wasm-backed flight position log (read side).
 *
 * Used ONLY in Node.js server context (App Router Route Handlers; the writer
 * lives in `server.js`). Never imported in browser-side code.
 *
 * Driver history: sql.js (in-memory, whole-file parse per open) → replaced
 * 2026-07 by node-sqlite3-wasm, which implements a real SQLite VFS over Node's
 * fs API. Reads pull only the pages a query touches, so cost no longer scales
 * with total database size — the property that lets the log grow unbounded
 * (growing history is a product goal, see AGENTS.md). Still pure WASM: no
 * native compilation, so the mac→linux `node_modules` rsync deploy keeps
 * working, and the driver is independent of the host's Node version.
 *
 * Concurrency: the writer (`server.js`) commits short transactions on the same
 * file. Without WAL (unsupported in WASM builds) a reader can hit SQLITE_BUSY
 * during a write — queries run through `withBusyRetry`.
 */

import { Database } from "node-sqlite3-wasm";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PositionRow {
  id: number;
  icao24: string;
  callsign: string | null;
  lat: number;
  lng: number;
  alt_baro_m: number | null;
  alt_geom_m: number | null;
  speed_mps: number | null;
  track_deg: number | null;
  vert_rate_fpm: number | null;
  squawk: string | null;
  rssi: number | null;
  registration: string | null;
  aircraft_type: string | null;
  logged_at: number;
  /** Koji je receiver upisao ovaj red: "localsdr" | "avionix" | null (stariji redci prije 2026-08-21). */
  source: string | null;
}

export interface AircraftRow {
  icao24: string;
  registration: string | null;
  aircraft_type: string | null;
  description: string | null;
  first_seen: number;
  last_seen: number;
  /** Dispečerski izvedena ruta (Avionix Nano only) — nije autoritativan podatak. */
  origin: string | null;
  destination: string | null;
  /** Koji je izvor zadnji upisao ovaj zapis: "localsdr" | "avionix". */
  source: string | null;
}

export interface HeatmapCell {
  lat: number;
  lng: number;
  count: number;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  alt_baro_m: number | null;
  logged_at: number;
}

export interface CallsignRoute {
  callsign: string;
  points: RoutePoint[];
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export function dbPath(): string {
  return path.join(process.cwd(), "data", "flight-log.db");
}

/**
 * Persistent read-only connection, reused across requests. The file is
 * modified in place by the writer, so an open handle always sees fresh
 * committed data — no reopen per request. Keyed by inode: if the file is
 * *replaced* (backup restore, manual copy), the inode changes and the stale
 * handle would keep reading the old blocks, so reopen then.
 */
let conn: { ino: bigint | number; db: Database } | null = null;

function openReadDb(): Database | null {
  const file = dbPath();
  let ino: bigint | number;
  try {
    ino = fs.statSync(file).ino;
  } catch {
    return null;
  }
  if (conn?.ino === ino) return conn.db;

  try {
    conn?.db.close();
  } catch {
    // Old handle already dead (file replaced under it) — nothing to release.
  }
  conn = null;

  try {
    const db = new Database(file, { readOnly: true });
    try {
      // Wait up to 2 s on the writer's lock before surfacing SQLITE_BUSY.
      db.exec("PRAGMA busy_timeout = 2000");
    } catch {
      // Pragma support varies in WASM builds; withBusyRetry covers the gap.
    }
    conn = { ino, db };
    return db;
  } catch {
    return null;
  }
}

/**
 * One bucket of "meaningfully new history". See `dbVersionKey`.
 *
 * Production ingests ~60 k positions/day (~2.5 k/h), so 5 000 rows is roughly
 * two hours of full-sky coverage — order a hundred complete passes, enough to
 * move a schedule forecast. Anything smaller is under 0.3 % of the ~1.6 M rows
 * a 30-day window already holds and cannot change the answer.
 */
export const VERSION_BUCKET_ROWS = 5_000;

/**
 * Coarse version of the on-disk database ("none" while the file doesn't
 * exist), used by the API routes' TTL body caches as part of their cache key.
 *
 * A version key has to change when the answer would change and — just as
 * importantly — *not* change otherwise. This used to be `${mtimeMs}:${size}`,
 * which fails the second half completely: `server.js` commits every poll tick
 * (~15 s), so in production no two requests ever shared a key and the caches
 * were dead code. Measured 2026-08-21 on production, twice in a row with
 * identical params: `photo-spots` 12.8 s, `transit-calendar` 4.5 s.
 *
 * Three parts now cover the three distinct ways the data can change:
 *  - `ino` — the file was *replaced* (backup restore, manual copy). Exact, and
 *    stays exact: results computed against a different database must never be
 *    reused, and this is the same signal `openReadDb` reopens on.
 *  - `MAX(id) / VERSION_BUCKET_ROWS` — how much history has landed, in coarse
 *    buckets. The writer only appends and `positions.id` is AUTOINCREMENT, so
 *    this is a monotone row counter, and `MAX(id)` is a rightmost descent of
 *    the primary-key btree — O(log n) no matter how large the file grows
 *    (233 MB+ and growing by design, see AGENTS.md).
 *  - the caller's own TTL — the ceiling on staleness.
 *
 * In steady state the TTL is what fires: at the current rate a bucket takes
 * ~2 h to roll, far longer than any TTL here (5–15 min), so ordinary ingest no
 * longer busts anything. The row bucket earns its place in the abnormal case
 * the exact key was there for — a bulk import or a catch-up backfill jumps
 * several buckets at once and invalidates on the very next request, rather
 * than waiting out the TTL.
 */
export function dbVersionKey(): string {
  let ino: bigint | number;
  try {
    ino = fs.statSync(dbPath()).ino;
  } catch {
    return "none";
  }

  const db = openReadDb();
  if (!db) return `${ino}:unknown`;
  try {
    const maxId =
      (withBusyRetry(() => db.get("SELECT MAX(id) AS n FROM positions")) as {
        n: number | null;
      } | null)?.n ?? 0;
    return `${ino}:${Math.floor(maxId / VERSION_BUCKET_ROWS)}`;
  } catch {
    // BUSY past the retries, or the table mid-migration. Degrade to a plain
    // TTL cache (stable key) rather than to a per-request key — the latter is
    // the bug this function exists to not have.
    return `${ino}:unknown`;
  }
}

/**
 * Rollback-journal SQLite returns SQLITE_BUSY to a reader that collides with
 * the writer's commit. Collisions are rare (one writer, ~15 s cadence, ms-long
 * transactions) and transient, so a short blocking backoff is enough.
 */
function withBusyRetry<T>(fn: () => T): T {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60);
    }
    try {
      return fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/busy|locked/i.test(msg)) throw e;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Read helpers (used by API routes)
// ---------------------------------------------------------------------------

export async function getTrack(
  icao24: string,
  fromMs: number,
  toMs: number
): Promise<PositionRow[]> {
  const db = openReadDb();
  if (!db) return [];
  try {
    return withBusyRetry(() =>
      db.all(
        `SELECT * FROM positions
         WHERE icao24 = ? AND logged_at >= ? AND logged_at <= ?
         ORDER BY logged_at ASC LIMIT 10000`,
        [icao24, fromMs, toMs]
      )
    ) as unknown as PositionRow[];
  } catch {
    return [];
  }
}

export interface HeatmapHourFilter {
  /** Local hour of day 0–23 (inclusive window start). */
  fromHour: number;
  /** Local hour of day 0–23 (inclusive window end; may be < fromHour = wraps midnight). */
  toHour: number;
  /** Offset to add to UTC epoch ms so hours land in the viewer's local day. */
  tzOffsetMs: number;
}

export async function getHeatmapCells(
  fromMs: number,
  resolution = 0.05,
  hourFilter?: HeatmapHourFilter
): Promise<HeatmapCell[]> {
  const db = openReadDb();
  if (!db) return [];
  try {
    // Local hour of day derived from epoch ms + viewer tz offset. The window is
    // inclusive on both ends; from > to wraps around midnight (e.g. 22–04).
    let hourClause = "";
    const hourArgs: number[] = [];
    if (hourFilter) {
      const hourExpr = `CAST(((logged_at + ?) / 3600000) % 24 AS INTEGER)`;
      if (hourFilter.fromHour <= hourFilter.toHour) {
        hourClause = ` AND ${hourExpr} BETWEEN ? AND ?`;
        hourArgs.push(hourFilter.tzOffsetMs, hourFilter.fromHour, hourFilter.toHour);
      } else {
        hourClause = ` AND (${hourExpr} >= ? OR ${hourExpr} <= ?)`;
        hourArgs.push(
          hourFilter.tzOffsetMs, hourFilter.fromHour,
          hourFilter.tzOffsetMs, hourFilter.toHour
        );
      }
    }
    const rows = withBusyRetry(() =>
      db.all(
        `SELECT
           ROUND(lat / ?) * ? AS cell_lat,
           ROUND(lng / ?) * ? AS cell_lng,
           COUNT(*) AS cnt
         FROM positions
         WHERE logged_at >= ?${hourClause}
         GROUP BY cell_lat, cell_lng
         HAVING cnt >= 2`,
        [resolution, resolution, resolution, resolution, fromMs, ...hourArgs]
      )
    ) as unknown as Array<{ cell_lat: number; cell_lng: number; cnt: number }>;
    return rows.map((r) => ({ lat: r.cell_lat, lng: r.cell_lng, count: r.cnt }));
  } catch {
    return [];
  }
}

/**
 * One feature per *pass*, not per callsign. A callsign that flies the corridor
 * daily yields one polyline per flight; concatenating its 30 days of points
 * into a single LineString drew long straight jumps between the end of one
 * day's pass and the start of the next — the starburst of rays over the
 * observer. Same 20-minute gap rule as `getCallsignSessions`.
 */
/** Consecutive fixes sit ~3.4 km apart at cruise (p50) and 99 % are under
 *  16 km. Anything past 25 km is the aircraft dropping out of receiver
 *  coverage and reappearing — joining those two fixes draws a straight
 *  chord that never happened, so cut the pass there instead. */
const PASS_MAX_SEGMENT_KM = 25;
const PASS_GAP_MS = 20 * 60_000;

/**
 * Splits a callsign-ordered, time-ordered row stream into passes: a new pass
 * starts on a callsign change, a time gap over 20 min, or a >25 km coverage
 * jump. Shared by `getRoutesByCallsign` (per-pass features) and
 * `getAllCallsignSessions` (per-callsign session lists for schedule
 * prediction) so the two never drift apart on what counts as "one flight".
 */
function groupPositionsIntoPasses(
  rows: Iterable<{
    callsign: string;
    lat: number;
    lng: number;
    alt_baro_m: number | null;
    alt_geom_m?: number | null;
    logged_at: number;
  }>,
  minPoints: number
): CallsignRoute[] {
  const result: CallsignRoute[] = [];
  let currentCallsign: string | null = null;
  let current: RoutePoint[] = [];

  const flush = () => {
    if (currentCallsign !== null && current.length >= minPoints) {
      result.push({ callsign: currentCallsign, points: current });
    }
    current = [];
  };

  // Rows arrive ordered by (callsign, logged_at), so a pass ends at a
  // callsign change, a time gap over PASS_GAP_MS, or a coverage jump.
  for (const r of rows) {
    const prev = current[current.length - 1];
    if (
      r.callsign !== currentCallsign ||
      (prev &&
        (r.logged_at - prev.logged_at > PASS_GAP_MS ||
          approxDistanceKm(prev.lat, prev.lng, r.lat, r.lng) >
            PASS_MAX_SEGMENT_KM))
    ) {
      flush();
      currentCallsign = r.callsign;
    }
    current.push({
      lat: r.lat,
      lng: r.lng,
      alt_baro_m: r.alt_baro_m,
      logged_at: r.logged_at,
    });
  }
  flush();

  return result;
}

/**
 * Runs `sql` and folds the result straight into passes **without materialising
 * the row array first**.
 *
 * `db.all()` builds a JS array of one object per row before anything can look
 * at it — 1.6 M+ objects for a 30-day window, allocated and retained all at
 * once purely to be walked in order and dropped. Streaming the same rows with
 * `Statement.iterate()` costs the same per-row object but skips the array, and
 * measured on a production-shaped 2.5 M row log that alone takes the read from
 * 2 730 ms to 1 652 ms. The rows arrive in the same `(callsign, logged_at)`
 * order either way, so the pass-splitting logic is untouched.
 *
 * `withBusyRetry` wraps the whole fold rather than a single call: a writer
 * collision can surface part-way through iteration, and the only sane recovery
 * is to finalize and re-run from the first row.
 */
function foldPositionsIntoPasses(
  db: Database,
  sql: string,
  params: Array<number | string>,
  minPoints: number
): CallsignRoute[] {
  return withBusyRetry(() => {
    const stmt = db.prepare(sql);
    try {
      return groupPositionsIntoPasses(
        stmt.iterate(params) as unknown as Iterable<{
          callsign: string;
          lat: number;
          lng: number;
          alt_baro_m: number | null;
          logged_at: number;
        }>,
        minPoints
      );
    } finally {
      stmt.finalize();
    }
  });
}

export async function getRoutesByCallsign(
  fromMs: number,
  toMs: number,
  minPoints = 10,
  maxPointsPerRoute = 150,
  maxRoutes = 2000
): Promise<CallsignRoute[]> {
  const db = openReadDb();
  if (!db) return [];
  try {
    const passes = foldPositionsIntoPasses(
      db,
      `SELECT callsign, lat, lng, alt_baro_m, logged_at
         FROM positions
         WHERE callsign IS NOT NULL AND callsign != ''
           AND logged_at >= ? AND logged_at <= ?
         ORDER BY callsign ASC, logged_at ASC`,
      [fromMs, toMs],
      minPoints
    );

    const result = passes.map((pass) => ({
      callsign: pass.callsign,
      points: evenSample(pass.points, maxPointsPerRoute),
    }));

    // Cap the payload by keeping the most recent passes — an unbounded feature
    // count is what makes the layer both unreadable and slow.
    if (result.length > maxRoutes) {
      result.sort(
        (a, b) =>
          b.points[b.points.length - 1].logged_at -
          a.points[a.points.length - 1].logged_at
      );
      result.length = maxRoutes;
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * All passes in the window, grouped by callsign (not truncated / recency
 * capped) — used by the transit-calendar forecast, which needs the *full*
 * historical session set per callsign to fit a schedule, not just the most
 * recent N passes globally. Includes `alt_geom_m` (geometric altitude,
 * preferred over `alt_baro_m` for closest-approach geometry — same
 * `COALESCE` preference `getPositionsInBounds` uses for the retro scan).
 */
export async function getAllCallsignSessions(
  fromMs: number,
  toMs: number,
  minPoints = 3
): Promise<Map<string, RoutePoint[][]>> {
  const db = openReadDb();
  if (!db) return new Map();
  try {
    const passes = foldPositionsIntoPasses(
      db,
      `SELECT callsign, lat, lng,
                COALESCE(alt_geom_m, alt_baro_m) AS alt_baro_m,
                logged_at
         FROM positions
         WHERE callsign IS NOT NULL AND callsign != ''
           AND logged_at >= ? AND logged_at <= ?
         ORDER BY callsign ASC, logged_at ASC`,
      [fromMs, toMs],
      minPoints
    );
    const byCallsign = new Map<string, RoutePoint[][]>();
    for (const pass of passes) {
      const existing = byCallsign.get(pass.callsign);
      if (existing) existing.push(pass.points);
      else byCallsign.set(pass.callsign, [pass.points]);
    }
    return byCallsign;
  } catch {
    return new Map();
  }
}

export async function getStats(): Promise<{
  total: number;
  last24h: number;
  uniqueIcao: number;
  topCallsigns: Array<{ callsign: string; count: number }>;
}> {
  const db = openReadDb();
  if (!db) return { total: 0, last24h: 0, uniqueIcao: 0, topCallsigns: [] };
  const since24h = Date.now() - 86_400_000;
  return withBusyRetry(() => {
    const total = (db.get("SELECT COUNT(*) AS n FROM positions") as { n: number }).n;
    const last24h = (
      db.get("SELECT COUNT(*) AS n FROM positions WHERE logged_at >= ?", since24h) as { n: number }
    ).n;
    const uniqueIcao = (
      db.get("SELECT COUNT(DISTINCT icao24) AS n FROM positions") as { n: number }
    ).n;
    const topCallsigns = db.all(
      `SELECT callsign, COUNT(*) AS count FROM positions
       WHERE callsign IS NOT NULL AND logged_at >= ?
       GROUP BY callsign ORDER BY count DESC LIMIT 20`,
      since24h
    ) as unknown as Array<{ callsign: string; count: number }>;
    return { total, last24h, uniqueIcao, topCallsigns };
  });
}

export async function getAircraftMeta(icao24: string): Promise<AircraftRow | null> {
  const db = openReadDb();
  if (!db) return null;
  return withBusyRetry(() =>
    db.get("SELECT * FROM aircraft WHERE icao24 = ?", icao24)
  ) as unknown as AircraftRow | null;
}

export interface AircraftListRow {
  icao24: string;
  registration: string | null;
  aircraft_type: string | null;
  description: string | null;
  position_count: number;
  first_seen: number;
  last_seen: number;
  last_callsign: string | null;
  origin: string | null;
  destination: string | null;
  source: string | null;
}

export async function getAircraftList(
  fromMs: number,
  toMs: number,
  search = "",
  limit = 50,
  offset = 0
): Promise<{ rows: AircraftListRow[]; total: number }> {
  const db = openReadDb();
  if (!db) return { rows: [], total: 0 };
  const sl = search.trim().toUpperCase();
  const hasSearch = sl.length > 0;
  const searchClause = hasSearch
    ? ` AND (UPPER(p.icao24) LIKE '%' || ? || '%' OR UPPER(COALESCE(p.callsign,'')) LIKE '%' || ? || '%' OR UPPER(COALESCE(a.registration,'')) LIKE '%' || ? || '%')`
    : "";

  const baseArgs: (string | number)[] = [fromMs, toMs];
  const searchArgs: string[] = hasSearch ? [sl, sl, sl] : [];

  return withBusyRetry(() => {
    const total = (
      db.get(
        `SELECT COUNT(DISTINCT p.icao24) AS n
         FROM positions p
         LEFT JOIN aircraft a ON a.icao24 = p.icao24
         WHERE p.logged_at >= ? AND p.logged_at <= ?${searchClause}`,
        [...baseArgs, ...searchArgs]
      ) as { n: number }
    ).n;

    const rows = db.all(
      `SELECT
         p.icao24,
         COALESCE(a.registration,  MAX(p.registration))  AS registration,
         COALESCE(a.aircraft_type, MAX(p.aircraft_type)) AS aircraft_type,
         a.description,
         COUNT(*)                                           AS position_count,
         MIN(p.logged_at)                                  AS first_seen,
         MAX(p.logged_at)                                  AS last_seen,
         MAX(CASE WHEN p.callsign != '' THEN p.callsign END) AS last_callsign,
         a.origin,
         a.destination,
         a.source
       FROM positions p
       LEFT JOIN aircraft a ON a.icao24 = p.icao24
       WHERE p.logged_at >= ? AND p.logged_at <= ?${searchClause}
       GROUP BY p.icao24
       ORDER BY last_seen DESC
       LIMIT ? OFFSET ?`,
      [...baseArgs, ...searchArgs, limit, offset]
    ) as unknown as AircraftListRow[];

    return { rows, total };
  });
}

export interface ScanPositionRow {
  icao24: string;
  callsign: string | null;
  lat: number;
  lng: number;
  alt_m: number;
  logged_at: number;
}

/**
 * Positions inside a lat/lng bounding box with a usable altitude, for the
 * retro transit scan. Ordered by time so consecutive rows of one aircraft
 * can be grouped into events.
 */
export async function getPositionsInBounds(
  fromMs: number,
  toMs: number,
  latMin: number,
  latMax: number,
  lngMin: number,
  lngMax: number
): Promise<ScanPositionRow[]> {
  const db = openReadDb();
  if (!db) return [];
  try {
    return withBusyRetry(() =>
      db.all(
        `SELECT icao24, callsign, lat, lng,
                COALESCE(alt_geom_m, alt_baro_m) AS alt_m,
                logged_at
         FROM positions
         WHERE logged_at >= ? AND logged_at <= ?
           AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
           AND (alt_geom_m IS NOT NULL OR alt_baro_m IS NOT NULL)
         ORDER BY logged_at ASC`,
        [fromMs, toMs, latMin, latMax, lngMin, lngMax]
      )
    ) as unknown as ScanPositionRow[];
  } catch {
    return [];
  }
}

/**
 * Returns all position points for a specific callsign, grouped into flight
 * sessions. A new session begins when the gap between consecutive positions
 * exceeds 20 minutes. Sessions with fewer than 3 points are discarded.
 */
export async function getCallsignSessions(
  callsign: string,
  fromMs: number,
  toMs: number,
  maxPointsPerSession = 150
): Promise<RoutePoint[][]> {
  const db = openReadDb();
  if (!db) return [];
  try {
    const rows = withBusyRetry(() =>
      db.all(
        `SELECT lat, lng, alt_baro_m, logged_at
         FROM positions
         WHERE callsign = ? AND logged_at >= ? AND logged_at <= ?
         ORDER BY logged_at ASC`,
        [callsign, fromMs, toMs]
      )
    ) as unknown as RoutePoint[];

    const GAP_MS = 20 * 60_000;
    const sessions: RoutePoint[][] = [];
    let current: RoutePoint[] = [];

    for (const row of rows) {
      if (
        current.length > 0 &&
        row.logged_at - current[current.length - 1].logged_at > GAP_MS
      ) {
        if (current.length >= 3)
          sessions.push(evenSample(current, maxPointsPerSession));
        current = [];
      }
      current.push(row);
    }
    if (current.length >= 3)
      sessions.push(evenSample(current, maxPointsPerSession));

    return sessions;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Equirectangular approximation — plenty accurate for the tens-of-km
 *  comparisons this file makes, and far cheaper than haversine per row. */
function approxDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const midLat = ((lat1 + lat2) / 2) * toRad;
  return R * Math.hypot(dLat, dLng * Math.cos(midLat));
}

function evenSample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
  return out;
}
