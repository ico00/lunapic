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
 * @param {{ run: (sql: string) => void, all: (sql: string) => any[] }} db
 *   SQLite Database instanca (node-sqlite3-wasm; svaki driver s `run`/`all`
 *   metodama radi)
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
      logged_at     INTEGER NOT NULL,
      source        TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pos_icao24    ON positions(icao24)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pos_logged_at ON positions(logged_at)`);

  // Dodano 2026-08-21 — covering indeks za forecast rute (photo-spots,
  // transit-calendar). Obje čitaju cijeli prozor (default 30 dana) preko
  // `getAllCallsignSessions`: `... WHERE logged_at BETWEEN ? AND ?
  // ORDER BY callsign, logged_at`.
  //
  // S uskim `idx_pos_callsign(callsign)` plan je bio
  //   SEARCH USING INDEX idx_pos_callsign + USE TEMP B-TREE FOR ORDER BY
  // tj. hod po indeksu, lookup u tablicu za SVAKI redak (raspršeno po cijeloj
  // datoteci) i na kraju sort kroz privremeni b-tree. Cold scan je zbog toga
  // I/O-bound, ne CPU-bound: izmjereno 81 % vremena zahtjeva otpada na dohvat.
  //
  // Ovaj indeks nosi svih pet stupaca koje upit čita, pa plan postaje čisti
  // `SEARCH USING COVERING INDEX` bez sorta — tablica se ne dira uopće.
  // Mjereno na sintetičkom logu produkcijskog oblika (2.5 M redaka / 367 MB):
  //
  //   uski indeks    105 863 read poziva   434 MB pročitano   2 863 ms (topao)
  //   covering        36 199 read poziva   148 MB pročitano   1 094 ms (topao)
  //
  // Cijena je prostor: +148 MB. Uski `idx_pos_callsign` time postaje suvišan
  // (`callsign` je vodeći stupac ovoga, pa ga pokriva za svaki `callsign = ?`
  // i `callsign > ?`) i briše se niže → neto +108 MB (+29 %). Namjeran trade:
  // baza SMIJE rasti (AGENTS.md), I/O po upitu ne smije.
  //
  // Redoslijed stupaca nije proizvoljan: `(callsign, logged_at)` daje i
  // filtriranje i ORDER BY bez sorta; lat/lng/alt su repni "payload" stupci
  // koji indeks čine covering. `alt_geom_m` je prije `alt_baro_m` jer upit
  // radi `COALESCE(alt_geom_m, alt_baro_m)`.
  //
  // ⚠ POSTOJANJE INDEKSA NIJE DOVOLJNO. Bez `ANALYZE` planer ga zna
  // ignorirati: na produkciji je 2026-08-21 indeks bio izgrađen, a upit je i
  // dalje išao `idx_pos_logged_at` + TEMP B-TREE, jer bez statistike SQLite
  // pretpostavi da je `logged_at BETWEEN` vrlo selektivan (timestampovi su
  // gotovo jedinstveni — ANALYZE zapiše `idx_pos_logged_at -> 1597107 1`),
  // iako taj raspon vraća 79 % tablice. `ANALYZE` se namjerno NE zove ovdje
  // jer bi produžio start; radi ga `scripts/build-flight-log-index.mjs`, koji
  // ionako treba pokrenuti prije deploya (vidi niže).
  //
  // Izgradnja na postojećoj produkcijskoj bazi je JEDNOKRATNA i traje —
  // ~2 s na 367 MB lokalno, 7.1 s na produkcijskih 243 MB. Drži se
  // u vlastitom try/catch: `migrate()` se zove iz `server.js` unutar bloka
  // koji na iznimku GASI cijeli flight-logger, a log letova je važniji od
  // brzine forecast rute.
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_pos_callsign_time_cover
            ON positions(callsign, logged_at, lat, lng, alt_geom_m, alt_baro_m)`);
    // Tek NAKON što covering indeks stvarno postoji. Obrnuti redoslijed bi,
    // ako izgradnja pukne na pola, ostavio bazu bez ijednog indeksa na
    // callsignu → full table scan na svakom čitanju.
    const haveCover = db
      .all(`PRAGMA index_list(positions)`)
      .some((r) => r.name === "idx_pos_callsign_time_cover");
    if (haveCover) db.run(`DROP INDEX IF EXISTS idx_pos_callsign`);
  } catch (e) {
    // Stari plan i dalje radi, samo sporije — ne rušimo poller zbog indeksa.
    console.error(
      "[flightLogSchema] covering index migration failed:",
      e && e.message ? e.message : String(e)
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_pos_callsign ON positions(callsign)`);
  }

  // Dodano 2026-08-21 (source po zapisu — localsdr i avionix su dva neovisna RF
  // prijemnika koji su prije dijelili isti positions stream nerazlučivo, pa im
  // je RF/multipath šum jedan drugom kvario trag kad su oba vidjela isti avion
  // u istom ticku — vidi napomenu o cik-cak trailu u AGENTS.md). Postojeća
  // produkcijska baza (233 MB+) već ima `positions` bez ove kolone, pa CREATE
  // TABLE IF NOT EXISTS iznad ne pomaže — isti ALTER TABLE + guard obrazac kao
  // za `aircraft` tablicu niže.
  const positionsCols = new Set(
    db.all(`PRAGMA table_info(positions)`).map((r) => r.name)
  );
  if (!positionsCols.has("source")) {
    db.run(`ALTER TABLE positions ADD COLUMN source TEXT`);
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS aircraft (
      icao24        TEXT PRIMARY KEY,
      registration  TEXT,
      aircraft_type TEXT,
      description   TEXT,
      first_seen    INTEGER NOT NULL,
      last_seen     INTEGER NOT NULL,
      origin        TEXT,
      destination   TEXT,
      source        TEXT
    )
  `);

  // Dodano 2026-08-20 (origin/destination/source iz Avionix Nano) — postojeća
  // produkcijska baza (233 MB+) već ima `aircraft` tablicu bez ovih stupaca,
  // pa CREATE TABLE IF NOT EXISTS iznad ne pomaže. ALTER TABLE ADD COLUMN je
  // čisto aditivan (nova nullable kolona, bez prepisivanja postojećih redaka)
  // — sigurno na velikoj bazi. Guard preko PRAGMA table_info sprječava grešku
  // "duplicate column name" ako migrate() ikad postane pozivan više puta u
  // istom procesu ili nad već ažuriranom bazom.
  const aircraftCols = new Set(
    db.all(`PRAGMA table_info(aircraft)`).map((r) => r.name)
  );
  for (const col of ["origin", "destination", "source"]) {
    if (!aircraftCols.has(col)) {
      db.run(`ALTER TABLE aircraft ADD COLUMN ${col} TEXT`);
    }
  }
}

module.exports = { migrate };
