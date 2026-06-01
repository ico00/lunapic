/**
 * Custom HTTP server for self-hosted Node (e.g. cPanel Application Manager / Node.js Selector).
 *
 * Deploy: `npm ci` (or `npm install`), `npm run build`, then start with
 * `npm run start:cpanel` or set the application startup file to `server.js`.
 * cPanel usually sets PORT; bind address defaults to 0.0.0.0 so the reverse proxy can reach the app.
 *
 * Do not use with `output: 'standalone'` — use `.next/standalone/server.js` from the standalone
 * build instead, or remove `output: 'standalone'` from next.config.
 *
 * Sub-URL: vrijednost je u `cpanelBasePath.cjs` (isti kao `basePath` u `next build`).
 */

const { createServer } = require("node:http");
const { parse } = require("node:url");
const next = require("next");
const path = require("node:path");
const { createRequire } = require("node:module");
const fs = require("node:fs");

const requireFromRoot = createRequire(
  path.join(process.cwd(), "package.json")
);
const basePath = requireFromRoot(
  path.resolve(process.cwd(), "cpanelBasePath.cjs")
);
const basePathClean =
  String(basePath).trim().replace(/\/$/, "") || null;

// Jedini izvor istine za flight-log shemu (dijeli se s src/lib/db/flightLogDb.ts).
const { migrate: migrateFlightLogDb } = requireFromRoot(
  path.resolve(process.cwd(), "flightLogSchema.cjs")
);

const dev = process.env.NODE_ENV !== "production";

// Učitaj .env / .env.local u process.env PRIJE čitanja vlastitih varijabli (npr.
// LOCAL_SDR_URL niže). Next inače učita env tek u app.prepare(), pa bi top-level
// čitanja ovdje vidjela `undefined` → flight-logger bi se tiho preskočio lokalno.
// Već postojeće (prave) env varijable se NE prepisuju — sigurno na cPanelu.
require("@next/env").loadEnvConfig(process.cwd(), dev);

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const bindHost = process.env.BIND_HOST ?? "0.0.0.0";
/** Used by Next for dev/router; does not have to match the public domain behind a proxy. */
const nextHostname = process.env.NEXT_HOST ?? "localhost";

/**
 * cPanel/Passenger often forwards requests to the process with paths **stripped** of the
 * sub-URL, while Next with `basePath` expects the full path.
 */
function alignRequestUrlForSubdir(req) {
  if (!basePathClean || !req.url) return;
  const raw = req.url;
  if (raw.startsWith("/")) {
    const u = new URL(raw, "http://_");
    if (
      u.pathname === basePathClean ||
      u.pathname.startsWith(`${basePathClean}/`)
    ) {
      return;
    }
    u.pathname = basePathClean + (u.pathname === "/" ? "" : u.pathname);
    req.url = u.pathname + u.search;
  }
}

const app = next({ dev, hostname: nextHostname, port });
const handle = app.getRequestHandler();

// ---------------------------------------------------------------------------
// Flight position logger (only when LOCAL_SDR_URL is configured)
// ---------------------------------------------------------------------------

const LOCAL_SDR_URL_RAW = process.env.LOCAL_SDR_URL?.trim();

// Dijeli se s localsdr route handlerom — jedini izvor istine za SDR URL parsiranje.
const { parseSdrUrl } = requireFromRoot(
  path.resolve(process.cwd(), "sdrUrl.cjs")
);

const { url: LOCAL_SDR_URL, authHeader: LOCAL_SDR_AUTH } = LOCAL_SDR_URL_RAW
  ? parseSdrUrl(LOCAL_SDR_URL_RAW)
  : { url: null, authHeader: null };

// tar1090 serves per-aircraft metadata at /db/[2-char-prefix]/[hex].js —
// the same source its web UI uses for registration/type lookups.
const TAR1090_DB_BASE = LOCAL_SDR_URL
  ? LOCAL_SDR_URL.replace(/\/data\/aircraft\.json$/, "/db/")
  : null;

// In-memory cache: icao24 → {r, t, desc} | null  (null = tried, not found)
const icaoMetaCache = new Map();

async function fetchTar1090Meta(icao24) {
  if (icaoMetaCache.has(icao24)) return icaoMetaCache.get(icao24);
  const url = `${TAR1090_DB_BASE}${icao24.slice(0, 2)}/${icao24}.js`;
  try {
    const headers = LOCAL_SDR_AUTH ? { Authorization: LOCAL_SDR_AUTH } : {};
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(3_000) });
    if (!res.ok) { icaoMetaCache.set(icao24, null); return null; }
    const d = await res.json();
    const meta = {
      r:    typeof d.r === "string" && d.r.trim()    ? d.r.trim()    : null,
      t:    typeof d.t === "string" && d.t.trim()    ? d.t.trim()    : null,
      desc: typeof d.d === "string" && d.d.trim()    ? d.d.trim()    : null,
    };
    icaoMetaCache.set(icao24, meta);
    return meta;
  } catch {
    icaoMetaCache.set(icao24, null);
    return null;
  }
}

const POLL_INTERVAL_MS = 15_000;
const FT_TO_M = 0.3048;
const KNOTS_TO_MPS = 0.514444;
const MIN_MOVE_M = 120;
const MAX_GAP_MS = 90_000;

/**
 * Retention za flight-log — **OPT-IN, default ISKLJUČEN**.
 *
 * Briše se SAMO ako je `FLIGHT_LOG_RETENTION_DAYS` eksplicitno postavljen na
 * valjan broj ≥ 1. Bez te varijable poller NIKAD ne briše ništa (baza raste, ali
 * to je sigurna strana — gubitak podataka je gori od velike baze).
 *
 * Povijesna napomena: raniji default (90 dana, uvijek aktivan) je obrisao
 * produkcijsku bazu. Zato je sada opt-in + sa sanity-guardom u `pruneOldData`.
 */
const RETENTION_DAYS = (() => {
  const raw = process.env.FLIGHT_LOG_RETENTION_DAYS;
  if (raw == null || raw.trim() === "") return null; // nije postavljen → retention OFF
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 1 ? n : null;
})();
const RETENTION_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // svakih 6h

/** Haversine distance in metres. */
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function altFtToM(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    if (raw.toLowerCase() === "ground") return null;
    const n = parseFloat(raw);
    return isFinite(n) ? n * FT_TO_M : null;
  }
  return isFinite(raw) ? raw * FT_TO_M : null;
}

async function startFlightLogger() {
  if (!LOCAL_SDR_URL || !LOCAL_SDR_URL_RAW) return;

  // sql.js — pure JS/WASM SQLite, no native compilation needed
  let db;
  try {
    const initSqlJs = require("sql.js/dist/sql-asm.js");
    const SQL = await initSqlJs();
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const dbFile = path.join(dataDir, "flight-log.db");
    db = fs.existsSync(dbFile)
      ? new SQL.Database(fs.readFileSync(dbFile))
      : new SQL.Database();
    migrateFlightLogDb(db);
  } catch (e) {
    console.error("[flight-logger] Failed to init sql.js:", e.message);
    return;
  }

  function saveDb() {
    try {
      const buf = db.export();
      fs.writeFileSync(path.join(process.cwd(), "data", "flight-log.db"), Buffer.from(buf));
    } catch {}
  }

  // Save to disk every 30s and on process exit
  setInterval(saveDb, 30_000);
  process.on("exit", saveDb);
  // VAŽNO: nakon saveDb MORA process.exit(), inače handler "proguta" SIGTERM i
  // proces nikad ne završi → cPanel Stop / Passenger restart ne mogu ugasiti app
  // (stari proces nastavi pisati u bazu). Bez exita app je praktički nezaustavljiv.
  process.on("SIGTERM", () => { saveDb(); process.exit(0); });
  process.on("SIGINT", () => { saveDb(); process.exit(0); });

  /**
   * Briše zapise starije od retencije i povremeno VACUUM-a bazu.
   *
   * Sanity-guard: prebroji koliko bi redaka obrisao i koliko ostaje. Ako bi
   * obrisao SVE (a tablica nije prazna), to je gotovo sigurno scale/units
   * problem (npr. logged_at u sekundama vs cutoff u ms) — preskoči i glasno
   * upozori umjesto da uništi bazu. sql.js je sinkron → kratko blokira loop.
   */
  function pruneOldData() {
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    try {
      const count = (sql, params) => {
        const s = db.prepare(sql);
        if (params) s.bind(params);
        s.step();
        const n = s.getAsObject().n;
        s.free();
        return n;
      };
      const totalPos = count(`SELECT COUNT(*) AS n FROM positions`);
      const toDelete = count(
        `SELECT COUNT(*) AS n FROM positions WHERE logged_at < ?`,
        [cutoff]
      );

      if (totalPos > 0 && toDelete >= totalPos) {
        console.error(
          `[flight-logger] RETENTION ABORTED: cutoff bi obrisao sve ${totalPos} redaka ` +
            `(cutoff ${new Date(cutoff).toISOString()}). Vjerojatno scale/units problem — ` +
            `provjeri logged_at vrijednosti. Ništa nije obrisano.`
        );
        return;
      }

      db.run(`DELETE FROM positions WHERE logged_at < ?`, [cutoff]);
      db.run(`DELETE FROM aircraft  WHERE last_seen < ?`, [cutoff]);
      db.run(`VACUUM`);
      saveDb();
      console.log(
        `[flight-logger] Pruned ${toDelete}/${totalPos} positions older than ${RETENTION_DAYS}d ` +
          `(cutoff ${new Date(cutoff).toISOString()})`
      );
    } catch (e) {
      console.error("[flight-logger] prune failed:", e.message);
    }
  }

  // OPT-IN: prune se zakazuje SAMO ako je FLIGHT_LOG_RETENTION_DAYS postavljen.
  if (RETENTION_DAYS != null) {
    setTimeout(pruneOldData, 60_000);
    setInterval(pruneOldData, RETENTION_PRUNE_INTERVAL_MS);
    console.log(`[flight-logger] Retention ENABLED: ${RETENTION_DAYS}d`);
  } else {
    console.log("[flight-logger] Retention OFF (FLIGHT_LOG_RETENTION_DAYS nije postavljen)");
  }

  // icao24 → { lat, lng, logged_at }
  const lastSeen = new Map();

  async function poll() {
    let data;
    try {
      const fetchHeaders = LOCAL_SDR_AUTH
        ? { Authorization: LOCAL_SDR_AUTH }
        : {};
      const res = await fetch(LOCAL_SDR_URL, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return;
      data = await res.json();
    } catch {
      return;
    }

    const aircraft = data?.aircraft;
    if (!Array.isArray(aircraft) || aircraft.length === 0) return;

    const nowMs =
      typeof data.now === "number" && isFinite(data.now)
        ? data.now * 1000
        : Date.now();

    const posRows = [];
    const metaRows = [];

    for (const row of aircraft) {
      const hexRaw = row.hex;
      if (typeof hexRaw !== "string" || !hexRaw) continue;
      const icao24 = hexRaw.toLowerCase().trim();

      const lat = row.lat;
      const lng = row.lon;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      if (!isFinite(lat) || !isFinite(lng)) continue;

      const ageSec =
        typeof row.seen_pos === "number" && isFinite(row.seen_pos)
          ? row.seen_pos
          : typeof row.seen === "number" && isFinite(row.seen)
            ? row.seen
            : 0;
      const logged_at = Math.max(0, nowMs - ageSec * 1000);

      const prev = lastSeen.get(icao24);
      if (prev) {
        const moved = haversineM(prev.lat, prev.lng, lat, lng);
        if (moved < MIN_MOVE_M && logged_at - prev.logged_at < MAX_GAP_MS) continue;
      }
      lastSeen.set(icao24, { lat, lng, logged_at });

      const callRaw = row.flight;
      const callsign = typeof callRaw === "string" ? callRaw.trim() || null : null;
      const gs = row.gs;
      const speed_mps = typeof gs === "number" && isFinite(gs) ? gs * KNOTS_TO_MPS : null;
      const track = row.track;
      const track_deg = typeof track === "number" && isFinite(track) ? ((track % 360) + 360) % 360 : null;
      const br = row.baro_rate;
      const gr = row.geom_rate;
      const vert_rate_fpm = typeof br === "number" && isFinite(br) ? br : typeof gr === "number" && isFinite(gr) ? gr : null;
      const squawk = typeof row.squawk === "string" ? row.squawk.trim() || null : null;
      const rssi = typeof row.rssi === "number" && isFinite(row.rssi) ? row.rssi : null;
      const registration = typeof row.r === "string" ? row.r.trim() || null : null;
      const aircraft_type = typeof row.t === "string" ? row.t.trim() || null : null;
      const description = typeof row.desc === "string" ? row.desc.trim() || null : null;

      posRows.push([icao24, callsign, lat, lng, altFtToM(row.alt_baro), altFtToM(row.alt_geom),
        speed_mps, track_deg, vert_rate_fpm, squawk, rssi, registration, aircraft_type, logged_at]);

      if (registration || aircraft_type || description) {
        // 6 values: icao24, registration, aircraft_type, description, first_seen, last_seen
        metaRows.push([icao24, registration, aircraft_type, description, logged_at, logged_at]);
      }
    }

    // For aircraft whose registration/type weren't in aircraft.json, fetch from the
    // tar1090 per-aircraft DB endpoint (same data the tar1090 UI uses). Results are
    // cached in icaoMetaCache so each ICAO24 is fetched at most once per process run.
    if (TAR1090_DB_BASE && posRows.length > 0) {
      const toFetch = posRows
        .filter((r) => r[11] === null && r[12] === null && !icaoMetaCache.has(r[0]))
        .map((r) => r[0]);
      if (toFetch.length > 0) {
        await Promise.all(toFetch.map((icao) => fetchTar1090Meta(icao)));
      }
      for (const r of posRows) {
        if (r[11] !== null || r[12] !== null) continue;
        const meta = icaoMetaCache.get(r[0]);
        if (!meta) continue;
        r[11] = meta.r;
        r[12] = meta.t;
        if (meta.r || meta.t || meta.desc) {
          const idx = metaRows.findIndex((m) => m[0] === r[0]);
          if (idx >= 0) {
            metaRows[idx][1] = metaRows[idx][1] ?? meta.r;
            metaRows[idx][2] = metaRows[idx][2] ?? meta.t;
            metaRows[idx][3] = metaRows[idx][3] ?? meta.desc;
          } else {
            metaRows.push([r[0], meta.r, meta.t, meta.desc, r[13], r[13]]);
          }
        }
      }
    }

    for (const r of posRows) {
      db.run(
        `INSERT INTO positions (icao24,callsign,lat,lng,alt_baro_m,alt_geom_m,speed_mps,track_deg,vert_rate_fpm,squawk,rssi,registration,aircraft_type,logged_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, r
      );
    }
    for (const r of metaRows) {
      try {
        db.run(
          `INSERT INTO aircraft (icao24,registration,aircraft_type,description,first_seen,last_seen)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(icao24) DO UPDATE SET
             registration  = COALESCE(excluded.registration,  registration),
             aircraft_type = COALESCE(excluded.aircraft_type, aircraft_type),
             description   = COALESCE(excluded.description,   description),
             last_seen     = excluded.last_seen`, r
        );
      } catch (e) {
        console.error("[flight-logger] aircraft upsert failed:", e.message, r[0]);
      }
    }

    if (posRows.length > 0) saveDb();
  }

  poll().catch(() => {});
  setInterval(() => poll().catch(() => {}), POLL_INTERVAL_MS);
  console.log(`[flight-logger] Started (sql.js) — polling every ${POLL_INTERVAL_MS / 1000}s`);
}

app.prepare().then(async () => {
  await startFlightLogger();

  const server = createServer(async (req, res) => {
    try {
      alignRequestUrlForSubdir(req);
      const parsedUrl = parse(req.url ?? "", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request", req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("internal server error");
      }
    }
  });

  server.listen(port, bindHost, () => {
    console.log(
      `[moon-transit] Next.js ready (dev=${dev}) on http://${bindHost}:${port}`,
    );
  });
});
