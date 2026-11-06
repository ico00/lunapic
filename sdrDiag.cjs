"use strict";

/**
 * Dijagnostika Pija koju šalje `scripts/pi-net-watchdog.sh` (`data/sdr-diag.json`).
 *
 * Kad Pi utihne, server zna samo da snimak ne stiže. Uzrok (Wi-Fi, ruter, 5G,
 * DNS, slanje, readsb, Pi ugašen) zna samo Pi, i može ga javiti tek kad se veza
 * vrati. Zato Pi svaki završeni prekid sprema lokalno i šalje ga ovdje, a uz to
 * svakih ~60 s javlja svoje trenutno stanje (signal, uptime, zadnja greška
 * slanja). Aplikacija iz toga piše ZAŠTO prijemnik ne radi.
 *
 * Datoteka, ne memorija — isti razlog kao `sdrSnapshot.cjs`.
 */

const fs = require("node:fs");
const path = require("node:path");

const DIAG_FILE = path.join(process.cwd(), "data", "sdr-diag.json");

/** Koliko prekida čuvamo; Pi ih šalje nakon svakog prekida, dakle malo. */
const MAX_OUTAGES = 200;

const OUTAGE_CAUSES = Object.freeze([
  "wifi",
  "gateway",
  "internet",
  "dns",
  "server",
  "receiver",
  "pi-down",
]);
const PI_STATES = Object.freeze(["ok", ...OUTAGE_CAUSES]);

const MAX_TEXT = 200;
/** Epoch sekunde u razumnom rasponu — Pi bez RTC-a zna poslati smeće. */
const MIN_EPOCH_SEC = 1_600_000_000;
const MAX_EPOCH_SEC = 4_000_000_000;

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function text(v) {
  return typeof v === "string" && v.length > 0 ? v.slice(0, MAX_TEXT) : null;
}
function epochSec(v) {
  const n = num(v);
  return n != null && n >= MIN_EPOCH_SEC && n <= MAX_EPOCH_SEC ? Math.floor(n) : null;
}

/** @returns {object|null} očišćen prekid ili null ako nije valjan */
function sanitizeOutage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const start = epochSec(raw.start);
  const end = epochSec(raw.end);
  if (start == null || end == null || end < start) return null;
  if (!OUTAGE_CAUSES.includes(raw.cause)) return null;
  const ticks = {};
  if (raw.ticks && typeof raw.ticks === "object") {
    for (const c of OUTAGE_CAUSES) {
      const n = num(raw.ticks[c]);
      if (n != null && n > 0) ticks[c] = Math.floor(n);
    }
  }
  const minSignal = num(raw.minSignal);
  return {
    start,
    end,
    cause: raw.cause,
    detail: text(raw.detail),
    minSignalPct: minSignal != null && minSignal >= 0 && minSignal <= 100 ? minSignal : null,
    ticks,
    interruptedByBoot: raw.interruptedByBoot === true,
  };
}

/** @returns {object|null} očišćeno stanje Pija */
function sanitizeStatus(raw) {
  if (!raw || typeof raw !== "object") return null;
  const at = epochSec(raw.at);
  if (at == null) return null;
  const signal = num(raw.signalPct);
  return {
    at,
    state: PI_STATES.includes(raw.state) ? raw.state : null,
    detail: text(raw.detail),
    uptimeSec: num(raw.uptimeSec),
    signalPct: signal != null && signal >= 0 && signal <= 100 ? signal : null,
    throttled: text(raw.throttled),
    load1: num(raw.load1),
    readsbAgeSec: num(raw.readsbAgeSec),
    aircraft: num(raw.aircraft),
    pushLastOkAgeSec: num(raw.pushLastOkAgeSec),
    pushLastError: text(raw.pushLastError),
    pushLastErrorAt: epochSec(raw.pushLastErrorAt),
  };
}

function outageKey(o) {
  return `${o.start}:${o.cause}`;
}

/**
 * @returns {{ receivedAt: number|null, status: object|null, outages: object[] }}
 */
function readSdrDiag() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DIAG_FILE, "utf8"));
    return {
      receivedAt: num(parsed?.receivedAt),
      status: parsed?.status && typeof parsed.status === "object" ? parsed.status : null,
      outages: Array.isArray(parsed?.outages) ? parsed.outages : [],
    };
  } catch {
    return { receivedAt: null, status: null, outages: [] };
  }
}

/**
 * Spaja izvještaj s Pija u spremljeno stanje. Pi ponovno šalje prekide dok ne
 * dobije 200, pa se isti prekid (početak + uzrok) ne smije udvostručiti.
 * Čista funkcija — upis je u `recordSdrDiag`.
 */
function mergeSdrDiag(prev, report, receivedAtMs) {
  const status = sanitizeStatus(report?.status) ?? prev.status;
  const byKey = new Map(prev.outages.map((o) => [outageKey(o), o]));
  let accepted = 0;
  for (const raw of Array.isArray(report?.outages) ? report.outages : []) {
    const o = sanitizeOutage(raw);
    if (!o) continue;
    byKey.set(outageKey(o), o);
    accepted += 1;
  }
  const outages = [...byKey.values()]
    .sort((a, b) => b.start - a.start)
    .slice(0, MAX_OUTAGES);
  return { next: { receivedAt: receivedAtMs, status, outages }, accepted };
}

/** Atomičan upis (tmp + rename), kao `writeSdrSnapshot`. */
function recordSdrDiag(report, receivedAtMs) {
  const t = typeof receivedAtMs === "number" ? receivedAtMs : Date.now();
  const { next, accepted } = mergeSdrDiag(readSdrDiag(), report, t);
  const dir = path.dirname(DIAG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${DIAG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next), "utf8");
  fs.renameSync(tmp, DIAG_FILE);
  return { accepted, outages: next.outages.length };
}

module.exports = {
  DIAG_FILE,
  OUTAGE_CAUSES,
  MAX_OUTAGES,
  sanitizeOutage,
  sanitizeStatus,
  mergeSdrDiag,
  readSdrDiag,
  recordSdrDiag,
};
