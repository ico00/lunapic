/**
 * sql.js-backed flight position log.
 *
 * Used ONLY in Node.js server context (server.js background poller,
 * App Router Route Handlers). Never imported in browser-side code.
 *
 * Write path: server.js opens its own in-memory DB and saves to disk every 30s.
 * Read path: API routes open a fresh read-only copy from the file on each request.
 */

import type { Database, SqlJsStatic } from "sql.js";
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
}

export interface AircraftRow {
  icao24: string;
  registration: string | null;
  aircraft_type: string | null;
  description: string | null;
  first_seen: number;
  last_seen: number;
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
// Helpers
// ---------------------------------------------------------------------------

export function dbPath(): string {
  return path.join(process.cwd(), "data", "flight-log.db");
}

let _sqlPromise: Promise<SqlJsStatic> | null = null;

export async function getSql(): Promise<SqlJsStatic> {
  if (!_sqlPromise) {
    // Use asm.js (pure JS) variant — avoids WASM file dependency on hosts
    // that strip .wasm files (e.g. cPanel). Same API, no locateFile needed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const init = require("sql.js/dist/sql-asm.js") as (config?: object) => Promise<SqlJsStatic>;
    _sqlPromise = init();
  }
  return _sqlPromise;
}

// Shema (CREATE TABLE/INDEX) je jedini-izvor-istine u `flightLogSchema.cjs` u rootu,
// koji izvršava writer (server.js poller). Read-path ovdje otvara samo postojeće
// kopije baze i nikad ne migrira, pa duplikat sheme više ne stoji ovdje.

/** Open a fresh read-only in-memory copy from the DB file. Returns null if no file yet. */
/**
 * Parsed read-only snapshot of the database, shared by every read helper.
 *
 * sql.js has no incremental file access — `new SQL.Database(buf)` copies the
 * whole file into the WASM heap. Doing that per API call made every read scale
 * with total database size regardless of how selective the query was, which is
 * what made the flight-log endpoints crawl once the log grew past a few tens of
 * MB. The parse is cached and reused until the file actually changes.
 *
 * Invalidation is by (mtime, size): `server.js` rewrites the whole file every
 * 30 s, so the snapshot is at most one write cycle stale — the same staleness
 * the previous code had between a request's read and the next writer flush.
 */
let cachedDb: { key: string; db: Database } | null = null;
/** In-flight load, so concurrent misses parse the file once instead of N times. */
let loadingDb: { key: string; promise: Promise<Database> } | null = null;

function dbStatKey(file: string): string | null {
  try {
    const st = fs.statSync(file);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return null;
  }
}

/**
 * Opaque version of the on-disk database ("none" while the file doesn't exist).
 * Changes whenever the writer flushes. API routes use it to memoize expensive
 * responses: same version → same data, recompute only after a flush.
 */
export function dbVersionKey(): string {
  return dbStatKey(dbPath()) ?? "none";
}

async function openReadDb(): Promise<Database | null> {
  const file = dbPath();
  const key = dbStatKey(file);
  if (key == null) return null;

  if (cachedDb?.key === key) return cachedDb.db;
  if (loadingDb?.key === key) return loadingDb.promise;

  const promise = (async () => {
    const SQL = await getSql();
    const db = new SQL.Database(fs.readFileSync(file));
    // Safe to free the previous snapshot: read helpers run their queries
    // synchronously after awaiting this function, so nobody is mid-query on it.
    cachedDb?.db.close();
    cachedDb = { key, db };
    return db;
  })();
  loadingDb = { key, promise };
  try {
    return await promise;
  } finally {
    if (loadingDb?.promise === promise) loadingDb = null;
  }
}

// ---------------------------------------------------------------------------
// Read helpers (used by API routes — each opens a fresh copy)
// ---------------------------------------------------------------------------

export async function getTrack(
  icao24: string,
  fromMs: number,
  toMs: number
): Promise<PositionRow[]> {
  const db = await openReadDb();
  if (!db) return [];
  try {
    const stmt = db.prepare(
      `SELECT * FROM positions
       WHERE icao24 = ? AND logged_at >= ? AND logged_at <= ?
       ORDER BY logged_at ASC LIMIT 10000`
    );
    stmt.bind([icao24, fromMs, toMs]);
    const rows: PositionRow[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as PositionRow);
    stmt.free();
    return rows;
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
  const db = await openReadDb();
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
    const stmt = db.prepare(
      `SELECT
         ROUND(lat / ?) * ? AS cell_lat,
         ROUND(lng / ?) * ? AS cell_lng,
         COUNT(*) AS cnt
       FROM positions
       WHERE logged_at >= ?${hourClause}
       GROUP BY cell_lat, cell_lng
       HAVING cnt >= 2`
    );
    stmt.bind([resolution, resolution, resolution, resolution, fromMs, ...hourArgs]);
    const cells: HeatmapCell[] = [];
    while (stmt.step()) {
      const r = stmt.getAsObject() as unknown as {
        cell_lat: number;
        cell_lng: number;
        cnt: number;
      };
      cells.push({ lat: r.cell_lat, lng: r.cell_lng, count: r.cnt });
    }
    stmt.free();
    return cells;
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
export async function getRoutesByCallsign(
  fromMs: number,
  toMs: number,
  minPoints = 10,
  maxPointsPerRoute = 150,
  maxRoutes = 2000
): Promise<CallsignRoute[]> {
  const db = await openReadDb();
  if (!db) return [];
  try {
    const stmt = db.prepare(
      `SELECT callsign, lat, lng, alt_baro_m, logged_at
       FROM positions
       WHERE callsign IS NOT NULL AND callsign != ''
         AND logged_at >= ? AND logged_at <= ?
       ORDER BY callsign ASC, logged_at ASC`
    );
    stmt.bind([fromMs, toMs]);

    const GAP_MS = 20 * 60_000;
    // Consecutive fixes sit ~3.4 km apart at cruise (p50) and 99 % are under
    // 16 km. Anything past 25 km is the aircraft dropping out of receiver
    // coverage and reappearing — joining those two fixes draws a straight
    // chord that never happened, so cut the pass there instead.
    const MAX_SEGMENT_KM = 25;
    const result: CallsignRoute[] = [];
    let currentCallsign: string | null = null;
    let current: RoutePoint[] = [];

    const flush = () => {
      if (currentCallsign !== null && current.length >= minPoints) {
        result.push({
          callsign: currentCallsign,
          points: evenSample(current, maxPointsPerRoute),
        });
      }
      current = [];
    };

    // Rows arrive ordered by (callsign, logged_at), so a pass ends at a
    // callsign change, a time gap over GAP_MS, or a coverage jump.
    // Positional get() instead of getAsObject(): this is the hottest row loop
    // in the file (tens of thousands of rows per call) and the per-row object
    // build with column-name lookup measurably dominates it (~40 %).
    while (stmt.step()) {
      const [callsign, lat, lng, alt_baro_m, logged_at] = stmt.get() as [
        string,
        number,
        number,
        number | null,
        number,
      ];
      const prev = current[current.length - 1];
      if (
        callsign !== currentCallsign ||
        (prev &&
          (logged_at - prev.logged_at > GAP_MS ||
            approxDistanceKm(prev.lat, prev.lng, lat, lng) > MAX_SEGMENT_KM))
      ) {
        flush();
        currentCallsign = callsign;
      }
      current.push({ lat, lng, alt_baro_m, logged_at });
    }
    flush();
    stmt.free();

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

export async function getStats(): Promise<{
  total: number;
  last24h: number;
  uniqueIcao: number;
  topCallsigns: Array<{ callsign: string; count: number }>;
}> {
  const db = await openReadDb();
  if (!db) return { total: 0, last24h: 0, uniqueIcao: 0, topCallsigns: [] };
  const since24h = Date.now() - 86_400_000;

  const s1 = db.prepare("SELECT COUNT(*) AS n FROM positions");
  s1.step(); const total = (s1.getAsObject() as { n: number }).n; s1.free();

  const s2 = db.prepare("SELECT COUNT(*) AS n FROM positions WHERE logged_at >= ?");
  s2.bind([since24h]); s2.step();
  const last24h = (s2.getAsObject() as { n: number }).n; s2.free();

  const s3 = db.prepare("SELECT COUNT(DISTINCT icao24) AS n FROM positions");
  s3.step(); const uniqueIcao = (s3.getAsObject() as { n: number }).n; s3.free();

  const s4 = db.prepare(
    `SELECT callsign, COUNT(*) AS count FROM positions
     WHERE callsign IS NOT NULL AND logged_at >= ?
     GROUP BY callsign ORDER BY count DESC LIMIT 20`
  );
  s4.bind([since24h]);
  const topCallsigns: Array<{ callsign: string; count: number }> = [];
  while (s4.step()) topCallsigns.push(s4.getAsObject() as unknown as { callsign: string; count: number });
  s4.free();

  return { total, last24h, uniqueIcao, topCallsigns };
}

export async function getAircraftMeta(icao24: string): Promise<AircraftRow | null> {
  const db = await openReadDb();
  if (!db) return null;
  const stmt = db.prepare("SELECT * FROM aircraft WHERE icao24 = ?");
  stmt.bind([icao24]);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as unknown as AircraftRow;
  stmt.free();
  return row;
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
}

export async function getAircraftList(
  fromMs: number,
  toMs: number,
  search = "",
  limit = 50,
  offset = 0
): Promise<{ rows: AircraftListRow[]; total: number }> {
  const db = await openReadDb();
  if (!db) return { rows: [], total: 0 };
  const sl = search.trim().toUpperCase();
  const hasSearch = sl.length > 0;
  const searchClause = hasSearch
    ? ` AND (UPPER(p.icao24) LIKE '%' || ? || '%' OR UPPER(COALESCE(p.callsign,'')) LIKE '%' || ? || '%' OR UPPER(COALESCE(a.registration,'')) LIKE '%' || ? || '%')`
    : "";

  const baseArgs: (string | number)[] = [fromMs, toMs];
  const searchArgs: string[] = hasSearch ? [sl, sl, sl] : [];

  const s1 = db.prepare(
    `SELECT COUNT(DISTINCT p.icao24) AS n
     FROM positions p
     LEFT JOIN aircraft a ON a.icao24 = p.icao24
     WHERE p.logged_at >= ? AND p.logged_at <= ?${searchClause}`
  );
  s1.bind([...baseArgs, ...searchArgs]);
  s1.step();
  const total = (s1.getAsObject() as { n: number }).n;
  s1.free();

  const s2 = db.prepare(
    `SELECT
       p.icao24,
       COALESCE(a.registration,  MAX(p.registration))  AS registration,
       COALESCE(a.aircraft_type, MAX(p.aircraft_type)) AS aircraft_type,
       a.description,
       COUNT(*)                                           AS position_count,
       MIN(p.logged_at)                                  AS first_seen,
       MAX(p.logged_at)                                  AS last_seen,
       MAX(CASE WHEN p.callsign != '' THEN p.callsign END) AS last_callsign
     FROM positions p
     LEFT JOIN aircraft a ON a.icao24 = p.icao24
     WHERE p.logged_at >= ? AND p.logged_at <= ?${searchClause}
     GROUP BY p.icao24
     ORDER BY last_seen DESC
     LIMIT ? OFFSET ?`
  );
  s2.bind([...baseArgs, ...searchArgs, limit, offset]);
  const rows: AircraftListRow[] = [];
  while (s2.step()) rows.push(s2.getAsObject() as unknown as AircraftListRow);
  s2.free();

  return { rows, total };
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
  const db = await openReadDb();
  if (!db) return [];
  try {
    const stmt = db.prepare(
      `SELECT icao24, callsign, lat, lng,
              COALESCE(alt_geom_m, alt_baro_m) AS alt_m,
              logged_at
       FROM positions
       WHERE logged_at >= ? AND logged_at <= ?
         AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
         AND (alt_geom_m IS NOT NULL OR alt_baro_m IS NOT NULL)
       ORDER BY logged_at ASC`
    );
    stmt.bind([fromMs, toMs, latMin, latMax, lngMin, lngMax]);
    const rows: ScanPositionRow[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as ScanPositionRow);
    stmt.free();
    return rows;
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
  const db = await openReadDb();
  if (!db) return [];
  try {
    const stmt = db.prepare(
      `SELECT lat, lng, alt_baro_m, logged_at
       FROM positions
       WHERE callsign = ? AND logged_at >= ? AND logged_at <= ?
       ORDER BY logged_at ASC`
    );
    stmt.bind([callsign, fromMs, toMs]);
    const rows: RoutePoint[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as RoutePoint);
    }
    stmt.free();

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
