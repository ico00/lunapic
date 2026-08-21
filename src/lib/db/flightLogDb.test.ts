import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Database } from "node-sqlite3-wasm";
import { dbVersionKey, VERSION_BUCKET_ROWS } from "./flightLogDb";

/**
 * `dbVersionKey` is the cache key of every `/api/flight-log/*` TTL body cache.
 * Until 2026-08-21 it was `${mtimeMs}:${size}` of the log, which the poller
 * rewrites every ~15 s — so in production the key was unique per request and
 * the caches never hit (`photo-spots` re-ran its 12.8 s scan every time).
 * These tests pin both halves: stable across a poll tick, and *not* stable
 * when the data underneath really changed.
 */

const require_ = createRequire(import.meta.url);
const migrate = require_(path.join(process.cwd(), "flightLogSchema.cjs")).migrate as (
  db: Database
) => void;

let tmpDir: string;

/** The read the forecast routes live on — see `getAllCallsignSessions`. */
const SESSIONS_SQL = `SELECT callsign, lat, lng,
        COALESCE(alt_geom_m, alt_baro_m) AS alt_baro_m,
        logged_at
 FROM positions
 WHERE callsign IS NOT NULL AND callsign != ''
   AND logged_at >= ? AND logged_at <= ?
 ORDER BY callsign ASC, logged_at ASC`;

/** Write `count` positions starting at explicit id `startId`, as the poller would. */
function appendPositions(file: string, startId: number, count: number): void {
  const db = new Database(file);
  migrate(db);
  for (let i = 0; i < count; i++) {
    db.run(
      `INSERT INTO positions (id, icao24, callsign, lat, lng, logged_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [startId + i, "4bcdb4", "TEST1", 45.8, 16.0, Date.now()]
    );
  }
  db.close();
}

function dbFile(): string {
  return path.join(tmpDir, "data", "flight-log.db");
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "flightlogdb-"));
  fs.mkdirSync(path.join(tmpDir, "data"));
  // `dbPath()` resolves against cwd on every call, so stubbing cwd keeps the
  // real `data/flight-log.db` completely out of reach of these tests.
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("dbVersionKey", () => {
  it("is \"none\" while the log does not exist", () => {
    expect(dbVersionKey()).toBe("none");
  });

  it("survives an ordinary poll tick", () => {
    appendPositions(dbFile(), 1, 5);
    const before = dbVersionKey();

    // A tick writes a handful of rows and rewrites mtime/size — the exact pair
    // the old key was built from.
    appendPositions(dbFile(), 6, 10);

    expect(dbVersionKey()).toBe(before);
  });

  it("changes once a batch worth of history has landed", () => {
    appendPositions(dbFile(), 1, 5);
    const before = dbVersionKey();

    appendPositions(dbFile(), VERSION_BUCKET_ROWS + 1, 1);

    expect(dbVersionKey()).not.toBe(before);
  });

  it("changes when the file is replaced, even at the same row count", () => {
    appendPositions(dbFile(), 1, 5);
    const before = dbVersionKey();

    // Backup restore / manual copy: same rows, different inode. Results
    // computed against the old file must not be reused.
    const replacement = path.join(tmpDir, "restored.db");
    appendPositions(replacement, 1, 5);
    fs.renameSync(replacement, dbFile());

    expect(dbVersionKey()).not.toBe(before);
  });
});

/**
 * The forecast routes read a whole 30-day window (1.6 M+ rows in production),
 * and that read is I/O-bound, not CPU-bound — 81 % of a cold `photo-spots`
 * request was the fetch. What makes it cheap is that
 * `idx_pos_callsign_time_cover` carries every column the query selects, so
 * SQLite never touches the table heap and never sorts. Measured on a
 * production-shaped 2.5 M row log, losing that plan costs 434 MB of reads
 * instead of 148 MB. These tests pin the plan itself, because a regression
 * here is invisible in output and only shows up as a slow endpoint.
 */
describe("positions indexes", () => {
  function migratedDb() {
    appendPositions(dbFile(), 1, 3);
    return new Database(dbFile(), { readOnly: true });
  }

  it("covers the session read entirely, with no sort", () => {
    const db = migratedDb();
    try {
      // `INDEXED BY` pins what the index *can* do rather than what the planner
      // costs it at. On a three-row table SQLite rightly prefers the narrow
      // `idx_pos_logged_at`; at production scale (verified on a 2.5 M row
      // log, with and without ANALYZE stats) it picks this one unaided. What
      // must not regress is the index definition itself.
      const plan = db
        .all(
          `EXPLAIN QUERY PLAN ${SESSIONS_SQL.replace(
            "FROM positions",
            "FROM positions INDEXED BY idx_pos_callsign_time_cover"
          )}`,
          [0, Date.now()]
        )
        .map((r) => String(r.detail))
        .join(" | ");
      // "COVERING" is the whole point: drop any selected column from the
      // index and SQLite goes back to a heap lookup per row (434 MB of reads
      // instead of 148 MB on a production-shaped log).
      expect(plan).toContain("COVERING INDEX idx_pos_callsign_time_cover");
      // A temp b-tree here means the column order stopped satisfying
      // ORDER BY callsign, logged_at — the sort alone was ~970 ms.
      expect(plan).not.toContain("TEMP B-TREE");
    } finally {
      db.close();
    }
  });

  it("retires the narrow callsign index the covering one subsumes", () => {
    const db = migratedDb();
    try {
      const names = db
        .all(`PRAGMA index_list(positions)`)
        .map((r) => String(r.name));
      expect(names).toContain("idx_pos_callsign_time_cover");
      // Redundant: `callsign` leads the covering index, so it answers every
      // `callsign = ?` / `callsign > ?` lookup the narrow one did.
      expect(names).not.toContain("idx_pos_callsign");
    } finally {
      db.close();
    }
  });

  it("still seeks a single callsign's window by both columns", () => {
    const db = migratedDb();
    try {
      const plan = db
        .all(
          `EXPLAIN QUERY PLAN
           SELECT lat, lng, alt_baro_m, logged_at FROM positions
           WHERE callsign = ? AND logged_at >= ? AND logged_at <= ?
           ORDER BY logged_at ASC`,
          ["TEST1", 0, Date.now()]
        )
        .map((r) => String(r.detail))
        .join(" | ");
      expect(plan).toContain("callsign=? AND logged_at>? AND logged_at<?");
    } finally {
      db.close();
    }
  });
});
