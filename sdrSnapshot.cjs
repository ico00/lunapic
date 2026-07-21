"use strict";

/**
 * Jedini izvor istine za snapshot koji **Pi šalje** serveru
 * (`data/sdr-snapshot.json`).
 *
 * Zašto push umjesto pull: da bi server povlačio podatke, Pi mora biti javno
 * dostupan (Tailscale Funnel → javni DNS → certifikat → ingress). Ta se
 * registracija pokazala nestabilnom — javni DNS zapis je titrao pa je feed
 * padao svakih par dana. Pi ima pouzdan **izlazni** internet, pa sada on šalje.
 *
 * Datoteka (a ne memorija) jer Next rute i `server.js` ne dijele pouzdano
 * modulnu memoriju, a Passenger može podići više procesa. Dijele ga `server.js`
 * (CJS poller) i `src/lib/server/sdrSnapshotStore.ts` (typed wrapper) — zato
 * plain `.cjs`, isti obrazac kao `sdrUrl.cjs` / `flightLogSchema.cjs`.
 */

const fs = require("node:fs");
const path = require("node:path");

const SNAPSHOT_FILE = path.join(process.cwd(), "data", "sdr-snapshot.json");

/** Snapshot stariji od ovoga smatramo mrtvim (Pi šalje svakih ~15 s). */
const SNAPSHOT_STALE_AFTER_MS = 60_000;

/** @returns {{ receivedAt: number, body: string }|null} */
function readSdrSnapshot() {
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
 * Atomičan upis (tmp + rename) — čitatelj nikad ne vidi napola zapisan JSON,
 * što je bitno jer se piše svakih 15 s dok ga rute čitaju.
 * @param {string} body
 */
function writeSdrSnapshot(body) {
  const dir = path.dirname(SNAPSHOT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${SNAPSHOT_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ receivedAt: Date.now(), body }), "utf8");
  fs.renameSync(tmp, SNAPSHOT_FILE);
}

/** @returns {boolean} true kad snapshot postoji i nije prestar. */
function isSnapshotFresh(snapshot, nowMs) {
  const t = typeof nowMs === "number" ? nowMs : Date.now();
  return snapshot != null && t - snapshot.receivedAt <= SNAPSHOT_STALE_AFTER_MS;
}

module.exports = {
  SNAPSHOT_FILE,
  SNAPSHOT_STALE_AFTER_MS,
  readSdrSnapshot,
  writeSdrSnapshot,
  isSnapshotFresh,
};
