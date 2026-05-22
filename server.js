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

const dev = process.env.NODE_ENV !== "production";
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

const LOCAL_SDR_URL = process.env.LOCAL_SDR_URL?.trim();
const POLL_INTERVAL_MS = 15_000;
const FT_TO_M = 0.3048;
const KNOTS_TO_MPS = 0.514444;
const MIN_MOVE_M = 120;
const MAX_GAP_MS = 90_000;

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
  if (!LOCAL_SDR_URL) return;

  // sql.js — pure JS/WASM SQLite, no native compilation needed
  let db;
  try {
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const dbFile = path.join(dataDir, "flight-log.db");
    db = fs.existsSync(dbFile)
      ? new SQL.Database(fs.readFileSync(dbFile))
      : new SQL.Database();
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
  process.on("SIGTERM", () => { saveDb(); });

  // icao24 → { lat, lng, logged_at }
  const lastSeen = new Map();

  async function poll() {
    let data;
    try {
      const res = await fetch(LOCAL_SDR_URL, {
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
        metaRows.push([icao24, registration, aircraft_type, description, logged_at]);
      }
    }

    for (const r of posRows) {
      db.run(
        `INSERT INTO positions (icao24,callsign,lat,lng,alt_baro_m,alt_geom_m,speed_mps,track_deg,vert_rate_fpm,squawk,rssi,registration,aircraft_type,logged_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, r
      );
    }
    for (const r of metaRows) {
      db.run(
        `INSERT INTO aircraft (icao24,registration,aircraft_type,description,first_seen,last_seen)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(icao24) DO UPDATE SET
           registration  = COALESCE(excluded.registration,  registration),
           aircraft_type = COALESCE(excluded.aircraft_type, aircraft_type),
           description   = COALESCE(excluded.description,   description),
           last_seen     = excluded.last_seen`, r
      );
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
