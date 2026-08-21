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
