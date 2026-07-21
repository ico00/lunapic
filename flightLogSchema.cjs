"use strict";

/**
 * Jedini izvor istine za flight-log SQLite shemu.
 *
 * Učitava se runtime-om i iz `server.js` (CommonJS poller koji PIŠE) i — po potrebi —
 * iz Next route handlera (`src/lib/db/flightLogDb.ts`) preko apsolutnog `process.cwd()`
 * patha, isto kao `cpanelBasePath.cjs`. Plain `.cjs` da ga oba runtimea mogu `require`-ati
 * bez TS/bundler posredovanja.
 *
 * Ako mijenjaš shemu, mijenjaš je SAMO ovdje.
 *
 * @param {{ run: (sql: string) => void }} db  SQLite Database instanca
 *   (node-sqlite3-wasm; svaki driver s `run(sql)` metodom radi)
 */
function migrate(db) {
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

module.exports = { migrate };
