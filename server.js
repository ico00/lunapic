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

// Snapshot koji Pi šalje na `/api/localsdr/ingest` — u produkciji zamjenjuje
// povlačenje s Pija. Dijeli se s `sdrSnapshotStore.ts`.
const { readSdrSnapshot, isSnapshotFresh } = requireFromRoot(
  path.resolve(process.cwd(), "sdrSnapshot.cjs")
);

/** Push smjer je konfiguriran kad postoji ingest token (Pi tada šalje). */
const SDR_INGEST_ENABLED = Boolean(process.env.SDR_INGEST_TOKEN?.trim());

// Isti push/pull princip kao localsdr, za Avionix Nano uređaj — vidi
// `avionixSnapshot.cjs`.
const AVIONIX_URL_RAW = process.env.AVIONIX_URL?.trim();
const { url: AVIONIX_URL, authHeader: AVIONIX_AUTH } = AVIONIX_URL_RAW
  ? parseSdrUrl(AVIONIX_URL_RAW)
  : { url: null, authHeader: null };
const { readAvionixSnapshot, isAvionixSnapshotFresh } = requireFromRoot(
  path.resolve(process.cwd(), "avionixSnapshot.cjs")
);
const AVIONIX_INGEST_ENABLED = Boolean(process.env.AVIONIX_INGEST_TOKEN?.trim());

// tar1090 serves per-aircraft metadata at /db/[2-char-prefix]/[hex].js —
// the same source its web UI uses for registration/type lookups.
const TAR1090_DB_BASE = LOCAL_SDR_URL
  ? LOCAL_SDR_URL.replace(/\/data\/aircraft\.json$/, "/db/")
  : null;

/**
 * Odbaci tijelo odgovora koje ne čitamo.
 *
 * Node `fetch` (undici) **ne vraća konekciju u pool dok se tijelo ne pročita ili
 * ne uništi**. Svaki `return` bez čitanja tijela zato trajno zauzme jednu
 * konekciju; kod polla svakih 15 s to se kroz dan-dva nakupi i svi odlazni
 * zahtjevi prema tom originu počnu visjeti do timeouta. Undici drži pool **po
 * originu** — zato je "offline" javljao samo LunaPic ADS-B dok su OpenSky i
 * ADS-B One radili. Restart procesa je brisao pool → "restart u cPanelu pomogne".
 */
function discardBody(res) {
  try {
    res?.body?.cancel?.();
  } catch {
    /* već potrošeno ili nema tijela */
  }
}

/**
 * Keep-alive prema SDR-u ne donosi ništa (poll je svakih 15 s, socket ionako
 * istekne prije idućeg), a kroz Tailscale Funnel nosi rizik da undici reciklira
 * poluotvoreni socket nakon što tunel tiho padne.
 */
const SDR_CONNECTION_HEADERS = { Connection: "close" };

/**
 * `fetch` baca generički `TypeError: fetch failed`, a pravi razlog
 * (`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`, TLS greška…) skriva u `cause`.
 */
function describeFetchError(e) {
  if (!e) return "unknown";
  if (e.name === "TimeoutError") return "timeout";
  const cause = e.cause;
  if (cause) {
    return cause.code
      ? `${e.message}: ${cause.code} — ${cause.message}`
      : `${e.message}: ${cause.message}`;
  }
  return e.message ?? String(e);
}

// In-memory cache: icao24 → {r, t, desc} | null  (null = tried, not found)
const icaoMetaCache = new Map();

async function fetchTar1090Meta(icao24) {
  // U push načinu `LOCAL_SDR_URL` može biti prazan — tada nema tar1090 baze.
  // Bez ove provjere gradio bi se URL "null4b/4bcdb4.js" i slao zahtjev po
  // svakom novom avionu. (Registracija ionako dolazi iz OpenSky indeksa.)
  if (!TAR1090_DB_BASE) return null;
  if (icaoMetaCache.has(icao24)) return icaoMetaCache.get(icao24);
  const url = `${TAR1090_DB_BASE}${icao24.slice(0, 2)}/${icao24}.js`;
  try {
    const headers = LOCAL_SDR_AUTH
      ? { ...SDR_CONNECTION_HEADERS, Authorization: LOCAL_SDR_AUTH }
      : { ...SDR_CONNECTION_HEADERS };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(3_000) });
    if (!res.ok) {
      discardBody(res);
      icaoMetaCache.set(icao24, null);
      return null;
    }
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
  // Radi u oba smjera po izvoru: push (uređaj šalje snapshot) ili pull
  // (LOCAL_SDR_URL / AVIONIX_URL). Pokreće se čim JEDAN izvor ima bilo koji
  // od ta dva konfiguriran — inače avionix-only deployment (localsdr nikad
  // konfiguriran) tiho izgubi cijeli poller, uključujući triggerTransitScan
  // (pozadinski push alerti rade i bez otvorenog taba).
  const localsdrConfigured = SDR_INGEST_ENABLED || (LOCAL_SDR_URL && LOCAL_SDR_URL_RAW);
  const avionixConfigured = AVIONIX_INGEST_ENABLED || (AVIONIX_URL && AVIONIX_URL_RAW);
  if (!localsdrConfigured && !avionixConfigured) return;

  // node-sqlite3-wasm — pravi file-based SQLite preko WASM VFS-a. Piše izravno
  // u datoteku (nema sql.js obrasca "cijela baza u RAM-u + export svakih 30 s"),
  // pa trošak upisa više ne raste s veličinom baze — baza smije rasti neograničeno
  // (proizvodni cilj, vidi AGENTS.md). I dalje bez nativne kompilacije, pa
  // mac→linux rsync node_modules deploya i dalje radi.
  let db;
  try {
    const { Database } = require("node-sqlite3-wasm");
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const dbFile = path.join(dataDir, "flight-log.db");
    db = new Database(dbFile);
    try { db.exec("PRAGMA busy_timeout = 5000"); } catch {}
    migrateFlightLogDb(db);
  } catch (e) {
    console.error("[flight-logger] Failed to init node-sqlite3-wasm:", e.message);
    return;
  }

  function closeDb() {
    try { db.close(); } catch {}
  }

  // Upisi su sada durable na svakom COMMIT-u — nema periodičkog flusha.
  process.on("exit", closeDb);
  // VAŽNO: handler MORA završiti s process.exit(), inače "proguta" SIGTERM i
  // proces nikad ne završi → cPanel Stop / Passenger restart ne mogu ugasiti app
  // (stari proces nastavi pisati u bazu). Bez exita app je praktički nezaustavljiv.
  process.on("SIGTERM", () => { closeDb(); process.exit(0); });
  process.on("SIGINT", () => { closeDb(); process.exit(0); });

  /**
   * Briše zapise starije od retencije i povremeno VACUUM-a bazu.
   *
   * Sanity-guard: prebroji koliko bi redaka obrisao i koliko ostaje. Ako bi
   * obrisao SVE (a tablica nije prazna), to je gotovo sigurno scale/units
   * problem (npr. logged_at u sekundama vs cutoff u ms) — preskoči i glasno
   * upozori umjesto da uništi bazu. Driver je sinkron → kratko blokira loop.
   */
  function pruneOldData() {
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    try {
      const count = (sql, params) => db.get(sql, params).n;
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
      db.exec(`VACUUM`);
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

  // Dijagnostika: uzastopni neuspjesi prema Piju. Bez ovoga se u cPanel logu
  // nije vidjelo ništa — feed bi tiho utihnuo i UI bi samo javio "offline".
  let sdrFailStreak = 0;
  const SDR_FAIL_LOG_EVERY = 4; // ~1 min pri POLL_INTERVAL_MS = 15 s

  function noteSdrFailure(reason) {
    sdrFailStreak += 1;
    if (sdrFailStreak === 1 || sdrFailStreak % SDR_FAIL_LOG_EVERY === 0) {
      console.error(
        `[flight-logger] SDR nedostupan (${sdrFailStreak}× zaredom, ~${Math.round(
          (sdrFailStreak * POLL_INTERVAL_MS) / 1000
        )}s): ${reason}`
      );
    }
  }

  function noteSdrSuccess() {
    if (sdrFailStreak > 0) {
      console.log(
        `[flight-logger] SDR opet dostupan nakon ${sdrFailStreak} neuspjelih pokušaja`
      );
      sdrFailStreak = 0;
    }
  }

  let avionixFailStreak = 0;
  function noteAvionixFailure(reason) {
    avionixFailStreak += 1;
    if (avionixFailStreak === 1 || avionixFailStreak % SDR_FAIL_LOG_EVERY === 0) {
      console.error(
        `[flight-logger] Avionix nedostupan (${avionixFailStreak}× zaredom, ~${Math.round(
          (avionixFailStreak * POLL_INTERVAL_MS) / 1000
        )}s): ${reason}`
      );
    }
  }
  function noteAvionixSuccess() {
    if (avionixFailStreak > 0) {
      console.log(
        `[flight-logger] Avionix opet dostupan nakon ${avionixFailStreak} neuspjelih pokušaja`
      );
      avionixFailStreak = 0;
    }
  }

  /**
   * Push-pa-pull akvizicija snapshot JSON-a, dijeljena između localsdr i
   * avionix konfiguracije — obje slijede isti obrazac (snapshot prvo, mrežni
   * fetch tek ako snapshota nema/je zastario). Vraća `undefined` kad ništa
   * nije dostupno; pozivatelj se odlučuje treba li zbog toga preskočiti samo
   * taj izvor ili cijeli tick.
   */
  async function acquireSnapshotJson({
    ingestEnabled,
    readSnapshot,
    isSnapshotFresh: isFresh,
    pullUrl,
    pullAuthHeader,
    sourceLabel,
    noteFailure,
    noteSuccess,
  }) {
    let data;

    // 1) Push smjer: uređaj je poslao snapshot na svoju ingest rutu.
    //    Nema mrežnog poziva — nema ni ovisnosti o javnoj dostupnosti uređaja.
    if (ingestEnabled) {
      const snapshot = readSnapshot();
      if (isFresh(snapshot)) {
        try {
          data = JSON.parse(snapshot.body);
          noteSuccess();
        } catch {
          noteFailure("snapshot JSON neispravan");
          return undefined;
        }
      } else if (!pullUrl) {
        const ageSec =
          snapshot != null
            ? Math.round((Date.now() - snapshot.receivedAt) / 1000)
            : null;
        noteFailure(
          ageSec == null
            ? `${sourceLabel} još nije poslao nijedan snapshot`
            : `zadnji snapshot star ${ageSec}s — ${sourceLabel} ne šalje`
        );
        return undefined;
      }
    }

    // 2) Pull smjer (lokalni dev na istoj mreži, ili dok push još ne radi).
    if (data === undefined) {
      if (!pullUrl) return undefined;
      try {
        const fetchHeaders = pullAuthHeader
          ? { ...SDR_CONNECTION_HEADERS, Authorization: pullAuthHeader }
          : { ...SDR_CONNECTION_HEADERS };
        const res = await fetch(pullUrl, {
          headers: fetchHeaders,
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) {
          discardBody(res);
          noteFailure(`HTTP ${res.status}`);
          return undefined;
        }
        data = await res.json();
        noteSuccess();
      } catch (e) {
        noteFailure(describeFetchError(e));
        return undefined;
      }
    }

    return data;
  }

  async function poll() {
    const [sdrData, avionixData] = await Promise.all([
      localsdrConfigured
        ? acquireSnapshotJson({
            ingestEnabled: SDR_INGEST_ENABLED,
            readSnapshot: readSdrSnapshot,
            isSnapshotFresh,
            pullUrl: LOCAL_SDR_URL,
            pullAuthHeader: LOCAL_SDR_AUTH,
            sourceLabel: "Pi",
            noteFailure: noteSdrFailure,
            noteSuccess: noteSdrSuccess,
          })
        : Promise.resolve(undefined),
      avionixConfigured
        ? acquireSnapshotJson({
            ingestEnabled: AVIONIX_INGEST_ENABLED,
            readSnapshot: readAvionixSnapshot,
            isSnapshotFresh: isAvionixSnapshotFresh,
            pullUrl: AVIONIX_URL,
            pullAuthHeader: AVIONIX_AUTH,
            sourceLabel: "Avionix",
            noteFailure: noteAvionixFailure,
            noteSuccess: noteAvionixSuccess,
          })
        : Promise.resolve(undefined),
    ]);

    const sdrAircraft = sdrData?.aircraft;
    const hasSdrRows = Array.isArray(sdrAircraft) && sdrAircraft.length > 0;
    const avionixEntries =
      avionixData && typeof avionixData === "object"
        ? Object.entries(avionixData).filter(([, v]) => Array.isArray(v))
        : [];
    const hasAvionixRows = avionixEntries.length > 0;
    if (!hasSdrRows && !hasAvionixRows) return;

    const posRows = [];
    const metaRows = [];
    // Pun snapshot SVIH validnih aviona ovog ticka (FlightState oblik), neovisno o
    // MIN_MOVE filteru koji se tiče samo DB upisa. Koristi ga server-side transit scan.
    const liveFlights = [];
    // Sticky priority (mirroring commit 7d19f6b na klijentu): dva neovisna RF
    // prijemnika gotovo nikad ne javljaju identičnu poziciju za isti avion, pa
    // je pisanje OBA očitanja u positions za icao24 koji oba vide u istom ticku
    // stvaralo cik-cak u trailu (bez obzira na MIN_MOVE_M jer je svaki source
    // "kretanje" mjerio protiv istog dijeljenog lastSeen unosa). localsdr loop
    // ide prvi i puni ovaj Set; avionix loop niže u potpunosti preskače icao24
    // koje localsdr vidi ovaj tick — localsdr je autoritativan dok god ga vidi,
    // avionix i dalje puni avione koje localsdr ne vidi, bez izmjene.
    const localsdrIcaosThisTick = new Set();

    const nowMs =
      hasSdrRows && typeof sdrData.now === "number" && isFinite(sdrData.now)
        ? sdrData.now * 1000
        : Date.now();

    for (const row of hasSdrRows ? sdrAircraft : []) {
      const hexRaw = row.hex;
      if (typeof hexRaw !== "string" || !hexRaw) continue;
      const icao24 = hexRaw.toLowerCase().trim();

      const lat = row.lat;
      const lng = row.lon;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      if (!isFinite(lat) || !isFinite(lng)) continue;
      localsdrIcaosThisTick.add(icao24);

      const ageSec =
        typeof row.seen_pos === "number" && isFinite(row.seen_pos)
          ? row.seen_pos
          : typeof row.seen === "number" && isFinite(row.seen)
            ? row.seen
            : 0;
      const logged_at = Math.max(0, nowMs - ageSec * 1000);

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
      const alt_baro_m = altFtToM(row.alt_baro);
      const alt_geom_m = altFtToM(row.alt_geom);

      liveFlights.push({
        id: icao24,
        icao24,
        callSign: callsign,
        position: { lat, lng },
        baroAltitudeMeters: alt_baro_m,
        geoAltitudeMeters: alt_geom_m,
        groundSpeedMps: speed_mps,
        trackDeg: track_deg,
        timestamp: logged_at,
        providerId: "localsdr",
      });

      const prev = lastSeen.get(icao24);
      if (prev) {
        const moved = haversineM(prev.lat, prev.lng, lat, lng);
        if (moved < MIN_MOVE_M && logged_at - prev.logged_at < MAX_GAP_MS) continue;
      }
      lastSeen.set(icao24, { lat, lng, logged_at });

      posRows.push([icao24, callsign, lat, lng, alt_baro_m, alt_geom_m,
        speed_mps, track_deg, vert_rate_fpm, squawk, rssi, registration, aircraft_type, logged_at, "localsdr"]);

      if (registration || aircraft_type || description) {
        // 9 values: icao24, registration, aircraft_type, description, first_seen,
        // last_seen, origin, destination, source. tar1090/localsdr ne daje rutu.
        metaRows.push([icao24, registration, aircraft_type, description, logged_at, logged_at, null, null, "localsdr"]);
      }
    }

    // Avionix Nano openAir `/flight_updates` oblik je strukturno drugačiji od
    // tar1090 ({"<icao24>":[...]} umjesto {"aircraft":[...]}), pa je ovo
    // zaseban loop — polje po polju isti mapping kao klijentski
    // `parseAvionixAircraft.ts`. Dopisuje u iste posRows/metaRows/liveFlights/
    // lastSeen strukture kao localsdr loop iznad.
    if (hasAvionixRows) {
      const parsedTs =
        typeof avionixData.timestamp === "string"
          ? Date.parse(avionixData.timestamp)
          : NaN;
      const avionixNowMs = isFinite(parsedTs) ? parsedTs : Date.now();

      for (const [icaoHexRaw, entry] of avionixEntries) {
        const icao24 = String(icaoHexRaw).toLowerCase().trim();
        if (!icao24) continue;

        const lat = entry[4];
        const lng = entry[5];
        if (typeof lat !== "number" || typeof lng !== "number") continue;
        if (!isFinite(lat) || !isFinite(lng)) continue;
        // localsdr ima sticky prioritet za avione koje oba vide ovaj tick — vidi
        // napomenu uz `localsdrIcaosThisTick` deklaraciju iznad.
        if (localsdrIcaosThisTick.has(icao24)) continue;

        const callsign =
          typeof entry[0] === "string" && entry[0].trim() ? entry[0].trim() : null;
        const aircraft_type =
          typeof entry[1] === "string" && entry[1].trim() ? entry[1].trim() : null;
        const registration =
          typeof entry[2] === "string" && entry[2].trim() ? entry[2].trim() : null;
        const squawk =
          typeof entry[3] === "string" && entry[3].trim() ? entry[3].trim() : null;
        const altFt = typeof entry[6] === "number" && isFinite(entry[6]) ? entry[6] : null;
        const alt_baro_m = altFt != null ? altFt * FT_TO_M : null;
        const speedKt = typeof entry[7] === "number" && isFinite(entry[7]) ? entry[7] : null;
        const speed_mps = speedKt != null ? speedKt * KNOTS_TO_MPS : null;
        const heading = typeof entry[8] === "number" && isFinite(entry[8]) ? entry[8] : null;
        const track_deg = heading != null ? ((heading % 360) + 360) % 360 : null;
        const vert_rate_fpm =
          typeof entry[9] === "number" && isFinite(entry[9]) ? entry[9] : null;
        // Dispečerski izvedena ruta, ne autoritativan podatak — vidi napomenu
        // u parseAvionixAircraft.ts. Ipak korisna za prikaz u flight-logu.
        const origin =
          typeof entry[10] === "string" && entry[10].trim() ? entry[10].trim() : null;
        const destination =
          typeof entry[11] === "string" && entry[11].trim() ? entry[11].trim() : null;
        const logged_at = avionixNowMs;

        liveFlights.push({
          id: icao24,
          icao24,
          callSign: callsign,
          position: { lat, lng },
          baroAltitudeMeters: alt_baro_m,
          geoAltitudeMeters: null,
          groundSpeedMps: speed_mps,
          trackDeg: track_deg,
          timestamp: logged_at,
          providerId: "avionix",
        });

        const prev = lastSeen.get(icao24);
        if (prev) {
          const moved = haversineM(prev.lat, prev.lng, lat, lng);
          if (moved < MIN_MOVE_M && logged_at - prev.logged_at < MAX_GAP_MS) continue;
        }
        lastSeen.set(icao24, { lat, lng, logged_at });

        posRows.push([icao24, callsign, lat, lng, alt_baro_m, null,
          speed_mps, track_deg, vert_rate_fpm, squawk, null, registration, aircraft_type, logged_at, "avionix"]);

        if (registration || aircraft_type || origin || destination) {
          metaRows.push([icao24, registration, aircraft_type, null, logged_at, logged_at, origin, destination, "avionix"]);
        }
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
            metaRows.push([r[0], meta.r, meta.t, meta.desc, r[13], r[13], null, null, "localsdr"]);
          }
        }
      }
    }

    // Jedna transakcija po ticku: ~desetci INSERT-a postanu jedan fsync, i
    // čitači nikad ne vide poluupisan tick.
    if (posRows.length > 0 || metaRows.length > 0) {
      try {
        db.exec("BEGIN");
        for (const r of posRows) {
          db.run(
            `INSERT INTO positions (icao24,callsign,lat,lng,alt_baro_m,alt_geom_m,speed_mps,track_deg,vert_rate_fpm,squawk,rssi,registration,aircraft_type,logged_at,source)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, r
          );
        }
        for (const r of metaRows) {
          try {
            db.run(
              `INSERT INTO aircraft (icao24,registration,aircraft_type,description,first_seen,last_seen,origin,destination,source)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(icao24) DO UPDATE SET
                 registration  = COALESCE(excluded.registration,  registration),
                 aircraft_type = COALESCE(excluded.aircraft_type, aircraft_type),
                 description   = COALESCE(excluded.description,   description),
                 origin        = COALESCE(excluded.origin,        origin),
                 destination   = COALESCE(excluded.destination,   destination),
                 source        = COALESCE(excluded.source,        source),
                 last_seen     = excluded.last_seen`, r
            );
          } catch (e) {
            console.error("[flight-logger] aircraft upsert failed:", e.message, r[0]);
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        try { db.exec("ROLLBACK"); } catch {}
        console.error("[flight-logger] tick write failed:", e.message);
      }
    }

    // Server-side transit scan: pošalji pun snapshot internoj ruti koja računa
    // kandidate/aktivne tranzite po pretplati i šalje Web Push — radi i kad nema
    // nijednog otvorenog taba (ugašen ekran / app u pozadini).
    // Dedupe po icao24 (noviji timestamp pobjeđuje) — ako isti avion vidi i
    // localsdr i avionix u istom ticku, scan ruta treba jedan zapis po avionu,
    // ne dva (izbjegava dupli push alert).
    const liveFlightsByIcao = new Map();
    for (const f of liveFlights) {
      const cur = liveFlightsByIcao.get(f.icao24);
      if (!cur || f.timestamp >= cur.timestamp) liveFlightsByIcao.set(f.icao24, f);
    }
    triggerTransitScan([...liveFlightsByIcao.values()]);
  }

  poll().catch(() => {});
  setInterval(() => poll().catch(() => {}), POLL_INTERVAL_MS);
  console.log(`[flight-logger] Started (node-sqlite3-wasm) — polling every ${POLL_INTERVAL_MS / 1000}s`);
}

// ---------------------------------------------------------------------------
// Server-side transit scan trigger
// ---------------------------------------------------------------------------
const INTERNAL_SCAN_TOKEN = process.env.INTERNAL_SCAN_TOKEN?.trim();
// server.js je čisti Node (nije ga obradio Next build), pa `NEXT_PUBLIC_*` NIJE
// inlinean — provjeravamo samo runtime tajne. Public VAPID ključ ionako validira
// sama ruta (webPush.ts, gdje ga Next ugrađuje u build).
const VAPID_READY = Boolean(
  process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
);

/**
 * URL interne scan rute. Pod Phusion Passengerom (cPanel) `server.listen()` ne
 * veže TCP port — Passenger presreće — pa `127.0.0.1:PORT` NIJE dostupan. Zato
 * primarno gađamo javni URL (`NEXT_PUBLIC_SITE_URL`, koji već uključuje basePath),
 * a na `127.0.0.1` padamo samo kad app sami pokrećemo nodeom (lokalni dev).
 * `SCAN_TRIGGER_URL` je ručni override.
 */
function resolveScanUrl() {
  const explicit = process.env.SCAN_TRIGGER_URL?.trim();
  if (explicit) return explicit;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return `${site.replace(/\/$/, "")}/api/transit/scan`;
  return `http://127.0.0.1:${port}${basePathClean ?? ""}/api/transit/scan`;
}

/**
 * Best-effort POST trenutnog snapshota letova `/api/transit/scan` ruti.
 * Ruta računa kandidate po pretplati i šalje Web Push. Tiho odustaje ako token
 * ili VAPID nisu konfigurirani (značajka isključena).
 */
function triggerTransitScan(flights) {
  if (!INTERNAL_SCAN_TOKEN || !VAPID_READY) return;
  if (!Array.isArray(flights) || flights.length === 0) return;
  const url = resolveScanUrl();
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_SCAN_TOKEN,
    },
    body: JSON.stringify({ flights }),
    signal: AbortSignal.timeout(8_000),
  })
    // Odgovor nas ne zanima, ali ga MORAMO potrošiti — inače konekcija ostaje
    // zauzeta (vidi `discardBody`). Ovo je najčešći poziv u procesu (svaki tick).
    .then(discardBody)
    .catch(() => {});
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
