"use strict";

/**
 * Jedini izvor istine za snapshot koji **Avionix Nano uređaj šalje** serveru
 * (`data/avionix-snapshot.json`).
 *
 * Isti push-umjesto-pull princip kao `sdrSnapshot.cjs` (vidi taj komentar za
 * puno objašnjenje) — server ne može dohvatiti uređaj jer je na privatnom
 * LAN-u, pa uređaj sam šalje svoj `/flight_updates` payload preko
 * `avionix-push.sh` (systemd timer na samom uređaju).
 *
 * Zaseban od `sdrSnapshot.cjs` (drugačija imena exporta, drugačija datoteka) —
 * `server.js` require-a oba u istom scope-u, pa bi isti nazivi kolidirali.
 * Datoteka (a ne memorija) iz istog razloga kao SDR: Next rute i `server.js`
 * ne dijele pouzdano modulnu memoriju.
 */

const fs = require("node:fs");
const path = require("node:path");

const SNAPSHOT_FILE = path.join(process.cwd(), "data", "avionix-snapshot.json");

/** Snapshot stariji od ovoga smatramo mrtvim (uređaj šalje svakih ~10 s). */
const AVIONIX_SNAPSHOT_STALE_AFTER_MS = 60_000;

/** @returns {{ receivedAt: number, body: string }|null} */
function readAvionixSnapshot() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
    if (
      typeof parsed?.receivedAt !== "number" ||
      !Number.isFinite(parsed.receivedAt) ||
      typeof parsed?.body !== "string"
    ) {
      return null;
    }
    return { receivedAt: parsed.receivedAt, body: parsed.body };
  } catch {
    return null;
  }
}

/**
 * Atomičan upis (tmp + rename) — čitatelj nikad ne vidi napola zapisan JSON.
 * @param {string} body
 */
function writeAvionixSnapshot(body) {
  const dir = path.dirname(SNAPSHOT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${SNAPSHOT_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ receivedAt: Date.now(), body }), "utf8");
  fs.renameSync(tmp, SNAPSHOT_FILE);
}

/** @returns {boolean} true kad snapshot postoji i nije prestar. */
function isAvionixSnapshotFresh(snapshot, nowMs) {
  const t = typeof nowMs === "number" ? nowMs : Date.now();
  return snapshot != null && t - snapshot.receivedAt <= AVIONIX_SNAPSHOT_STALE_AFTER_MS;
}

module.exports = {
  SNAPSHOT_FILE,
  AVIONIX_SNAPSHOT_STALE_AFTER_MS,
  readAvionixSnapshot,
  writeAvionixSnapshot,
  isAvionixSnapshotFresh,
};
