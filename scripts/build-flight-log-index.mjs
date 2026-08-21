/**
 * Priprema flight-log bazu za covering indeks `idx_pos_callsign_time_cover`,
 * nad **živom** bazom i odvojeno od pokretanja aplikacije.
 *
 * Dva koraka, oba potrebna:
 *   1. CREATE INDEX — sam indeks.
 *   2. ANALYZE — bez njega ga planer ignorira. Vidi komentar niže; ovo je
 *      naučeno na produkciji, ne pretpostavka.
 *
 * Zašto zasebna skripta kad `migrate()` (flightLogSchema.cjs) ionako stvara
 * taj indeks: `migrate()` se zove iz `server.js` unutar
 * `app.prepare().then(async () => { await startFlightLogger(); ... })`, dakle
 * **prije** `server.listen()`, a node-sqlite3-wasm je sinkron. Na praznoj
 * bazi to je 1 ms i nikoga ne dira, ali prva izgradnja nad produkcijskom
 * bazom (243 MB / ~1.6 M redaka) mora pročitati sve retke, sortirati ih i
 * zapisati ~92 MB novih stranica — sve to blokira glavnu dretvu, pa
 * aplikacija u tom prozoru **ne sluša na portu** (Passenger vraća greške, ne
 * spore odgovore).
 *
 * Pokreneš li ovo dok app normalno radi, cijena se svede na to da poller
 * možda preskoči koji tick (dobije SQLITE_BUSY dok držimo lock), a HTTP
 * cijelo vrijeme odgovara. Nakon toga `CREATE INDEX IF NOT EXISTS` u
 * `migrate()` pri sljedećem restartu prođe u ~1 ms.
 *
 * Idempotentno i sigurno za ponovno pokretanje: ako indeks već postoji,
 * preskače izgradnju ali svejedno provjeri koristi li ga planer — pa služi i
 * kao „popravi ako je odlutalo”. Ne dira nijedan redak podataka; i indeks i
 * statistika su izvedeni podaci (`DROP INDEX idx_pos_callsign_time_cover`,
 * `DROP TABLE sqlite_stat1`).
 *
 * Pokretanje lokalno:
 *   node scripts/build-flight-log-index.mjs
 * Na produkciji (node nije u PATH-u, treba nodevenv):
 *   bash scripts/build-flight-log-index-remote.sh
 *
 * Opcije:
 *   --dry-run   samo ispiši stanje, procjenu i plan; ne diraj bazu
 *   --db=PATH   druga baza (default: <cwd>/data/flight-log.db)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const dbArg = args.find((a) => a.startsWith("--db="));
const DB_PATH = dbArg
  ? path.resolve(dbArg.slice("--db=".length))
  : path.join(process.cwd(), "data", "flight-log.db");

const COVER_INDEX = "idx_pos_callsign_time_cover";
const NARROW_INDEX = "idx_pos_callsign";
/**
 * Izmjereno: 148 MB indeksa na 2.5 M redaka (sintetički log), 92 MB na
 * 1.6 M redaka (produkcija). Služi samo za provjeru prostora prije početka.
 */
const BYTES_PER_INDEX_ENTRY = 60;
/**
 * Poller (`server.js`) piše svakih ~15 s i drži lock kratko. Radije čekamo
 * njega nego da puknemo na SQLITE_BUSY; on sa svoje strane ima 5 s pa će
 * preskočiti tick ako ga izgradnja pretekne.
 */
const BUSY_TIMEOUT_MS = 60_000;

const mb = (bytes) => `${(bytes / 1e6).toFixed(0)} MB`;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/** Plan upita koji forecast rute zapravo vrte (`getAllCallsignSessions`). */
function sessionPlan(db) {
  return db
    .all(
      `EXPLAIN QUERY PLAN
       SELECT callsign, lat, lng, COALESCE(alt_geom_m, alt_baro_m) AS alt_baro_m, logged_at
       FROM positions
       WHERE callsign IS NOT NULL AND callsign != ''
         AND logged_at >= ? AND logged_at <= ?
       ORDER BY callsign ASC, logged_at ASC`,
      [Date.now() - 30 * 86_400_000, Date.now()]
    )
    .map((r) => r.detail)
    .join(" | ");
}

function reportEstimate(db) {
  const rows = db.get(`SELECT COUNT(*) AS n FROM positions`).n;
  const estimate = rows * BYTES_PER_INDEX_ENTRY;
  console.log(`redaka:    ${rows.toLocaleString("hr-HR")}`);
  console.log(`procjena:  +${mb(estimate)} (~${BYTES_PER_INDEX_ENTRY} B/unos)`);

  // Prostora na cPanelu ima napretek, ali izgradnja koja stane na pola jer je
  // disk pun ostavlja bazu s djelomično zapisanim stranicama — jeftino je
  // provjeriti unaprijed.
  try {
    const stat = fs.statfsSync(path.dirname(DB_PATH));
    const free = stat.bavail * stat.bsize;
    console.log(`slobodno:  ${mb(free)}`);
    if (free < estimate * 3) {
      fail(
        `Premalo prostora: treba barem ${mb(estimate * 3)} (indeks + privremeni ` +
          `prostor za sort), slobodno ${mb(free)}.`
      );
    }
  } catch {
    console.log("slobodno:  (statfs nedostupan — preskačem provjeru)");
  }
}

function buildIndex(db) {
  console.log(`\n▶ CREATE INDEX ${COVER_INDEX} …`);
  console.log("  (poller može preskočiti koji tick dok držimo lock)");
  const t0 = Date.now();
  db.run(
    `CREATE INDEX IF NOT EXISTS ${COVER_INDEX}
     ON positions(callsign, logged_at, lat, lng, alt_geom_m, alt_baro_m)`
  );
  console.log(`✓ izgrađen u ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  // Tek NAKON što covering indeks stvarno postoji — isti guard kao u
  // `migrate()`. Obrnuti redoslijed bi, ako izgradnja pukne, ostavio bazu bez
  // ijednog indeksa na callsignu → full table scan na svakom čitanju.
  const after = db.all(`PRAGMA index_list(positions)`).map((r) => r.name);
  if (after.includes(COVER_INDEX) && after.includes(NARROW_INDEX)) {
    db.run(`DROP INDEX IF EXISTS ${NARROW_INDEX}`);
    console.log(
      `✓ ${NARROW_INDEX} maknut (suvišan — callsign je vodeći stupac novoga)`
    );
    // Oslobođene stranice ostaju u datoteci kao slobodne i troše ih budući
    // upisi. VACUUM bi ih vratio disku, ali traži ekskluzivni lock i kopiju
    // cijele baze — ne isplati se za ~25 MB.
  }
}

function refreshStats(db) {
  // ANALYZE nije kozmetika — bez njega planer ovaj indeks IGNORIRA.
  // Naučeno na produkciji 2026-08-21: indeks je bio izgrađen, ali upit je i
  // dalje išao `idx_pos_logged_at` + TEMP B-TREE. Razlog je u statistici koju
  // ANALYZE zapiše: `idx_pos_logged_at -> 1597107 1`, tj. prosječno JEDAN
  // redak po jedinstvenoj `logged_at` vrijednosti. Timestampovi su na
  // produkciji gotovo jedinstveni, pa bez stats-a SQLite pretpostavi da je
  // `logged_at BETWEEN` vrlo selektivan — iako taj raspon stvarno vraća 79 %
  // tablice (30-dnevni prozor nad 60 dana povijesti). Sa stats-om odabere
  // covering indeks.
  //
  // Zašto se ovo nije vidjelo lokalno: sintetički log ima točno 30 dana
  // povijesti i grupirane timestampove, pa je i bez stats-a birao covering.
  //
  // Jeftino je (1.1 s na produkciji) i reverzibilno (`DROP TABLE sqlite_stat1`).
  console.log(`\n▶ ANALYZE …`);
  const t0 = Date.now();
  db.run("ANALYZE");
  console.log(`✓ statistika osvježena u ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ---------------------------------------------------------------------------

if (!fs.existsSync(DB_PATH)) fail(`Baza ne postoji: ${DB_PATH}`);

let Database;
try {
  ({ Database } = require_("node-sqlite3-wasm"));
} catch {
  fail(
    "node-sqlite3-wasm nije dostupan. Na cPanelu prvo aktiviraj nodevenv " +
      "(vidi scripts/build-flight-log-index-remote.sh)."
  );
}

const sizeBefore = fs.statSync(DB_PATH).size;
console.log(`baza:      ${DB_PATH}`);
console.log(`veličina:  ${mb(sizeBefore)}`);

const db = new Database(DB_PATH);
try {
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
} catch {
  // Podrška za pragme varira u WASM buildovima; bez nje samo brže puknemo.
}

try {
  const indexes = db.all(`PRAGMA index_list(positions)`).map((r) => r.name);
  console.log(`indeksi:   ${indexes.join(", ") || "(nema)"}`);
  const alreadyBuilt = indexes.includes(COVER_INDEX);

  if (alreadyBuilt) {
    console.log(`\n✓ ${COVER_INDEX} već postoji — izgradnja se preskače.`);
  } else {
    reportEstimate(db);
  }

  if (DRY_RUN) {
    console.log(`\nplan:      ${sessionPlan(db)}`);
    console.log("\n--dry-run: baza nije dirana.");
    process.exit(0);
  }

  if (!alreadyBuilt) buildIndex(db);
  // Uvijek, i kad je indeks već postojao: postojanje indeksa ne znači da ga
  // planer koristi, a to je upravo kvar koji je ova skripta zatekla.
  refreshStats(db);

  const plan = sessionPlan(db);
  console.log(`\nplan:      ${plan}`);
  if (!plan.includes("COVERING INDEX")) {
    console.warn(
      `⚠ Planer NE koristi ${COVER_INDEX} ni nakon ANALYZE. Indeks postoji, ` +
        "ali upit i dalje ide starim putem — javi ovo prije nego zaključiš da " +
        "je gotovo."
    );
  }
  if (plan.includes("TEMP B-TREE")) {
    console.warn("⚠ Upit i dalje sortira kroz privremeni b-tree.");
  }

  const sizeAfter = fs.statSync(DB_PATH).size;
  console.log(
    `veličina:  ${mb(sizeBefore)} → ${mb(sizeAfter)} (+${mb(sizeAfter - sizeBefore)})`
  );
  console.log(
    "\n✓ Gotovo. Aplikaciju treba restartati da otvori novu konekciju — " +
      "postojeća i dalje vrti stari plan."
  );
} finally {
  try {
    db.close();
  } catch {
    // Već zatvorena / proces izlazi.
  }
}
