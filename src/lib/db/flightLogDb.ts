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
    // Dynamic require avoids Turbopack externalization issues with "sql.js" package name.
    // locateFile ensures the WASM file is found even when the module is bundled.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const init = require("sql.js") as (config?: object) => Promise<SqlJsStatic>;
    _sqlPromise = init({
      locateFile: (file: string) =>
        path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
    });
  }
  return _sqlPromise;
}

export function migrateDb(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS positions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      icao24        TEXT    NOT NULL,
      callsign      TEXT,
      lat           REAL    NOT NULL,
      lng           REAL    NOT NULL,
      alt_baro_m    REAL,
      alt_geom_m    REAL,
      speed_mps     REAL,
      track_deg     REAL,
      vert_rate_fpm REAL,
      squawk        TEXT,
      rssi          REAL,
      registration  TEXT,
      aircraft_type TEXT,
      logged_at     INTEGER NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pos_icao24    ON positions(icao24)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pos_logged_at ON positions(logged_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pos_callsign  ON positions(callsign)`);
  db.run(`
    CREATE TABLE IF NOT EXISTS aircraft (
      icao24        TEXT PRIMARY KEY,
      registration  TEXT,
      aircraft_type TEXT,
      description   TEXT,
      first_seen    INTEGER NOT NULL,
      last_seen     INTEGER NOT NULL
    )
  `);
}

/** Open a fresh read-only in-memory copy from the DB file. Returns null if no file yet. */
async function openReadDb(): Promise<Database | null> {
  const file = dbPath();
  if (!fs.existsSync(file)) return null;
  const SQL = await getSql();
  const buf = fs.readFileSync(file);
  return new SQL.Database(buf);
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
  } finally {
    db.close();
  }
}

export async function getHeatmapCells(
  fromMs: number,
  resolution = 0.05
): Promise<HeatmapCell[]> {
  const db = await openReadDb();
  if (!db) return [];
  try {
    const stmt = db.prepare(
      `SELECT
         ROUND(lat / ?) * ? AS cell_lat,
         ROUND(lng / ?) * ? AS cell_lng,
         COUNT(*) AS cnt
       FROM positions
       WHERE logged_at >= ?
       GROUP BY cell_lat, cell_lng
       HAVING cnt >= 2`
    );
    stmt.bind([resolution, resolution, resolution, resolution, fromMs]);
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
  } finally {
    db.close();
  }
}

export async function getRoutesByCallsign(
  fromMs: number,
  toMs: number,
  minPoints = 10,
  maxPointsPerRoute = 500
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

    const byCallsign = new Map<string, RoutePoint[]>();
    while (stmt.step()) {
      const r = stmt.getAsObject() as unknown as {
        callsign: string;
        lat: number;
        lng: number;
        alt_baro_m: number | null;
        logged_at: number;
      };
      let arr = byCallsign.get(r.callsign);
      if (!arr) { arr = []; byCallsign.set(r.callsign, arr); }
      arr.push({ lat: r.lat, lng: r.lng, alt_baro_m: r.alt_baro_m, logged_at: r.logged_at });
    }
    stmt.free();

    const result: CallsignRoute[] = [];
    for (const [callsign, pts] of byCallsign) {
      if (pts.length < minPoints) continue;
      result.push({ callsign, points: evenSample(pts, maxPointsPerRoute) });
    }
    return result;
  } finally {
    db.close();
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
  try {
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
  } finally {
    db.close();
  }
}

export async function getAircraftMeta(icao24: string): Promise<AircraftRow | null> {
  const db = await openReadDb();
  if (!db) return null;
  try {
    const stmt = db.prepare("SELECT * FROM aircraft WHERE icao24 = ?");
    stmt.bind([icao24]);
    if (!stmt.step()) { stmt.free(); return null; }
    const row = stmt.getAsObject() as unknown as AircraftRow;
    stmt.free();
    return row;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evenSample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
  return out;
}
