"use strict";

/**
 * Pamti kad je Pi zadnji put donio NOVE podatke i javlja prijelaz u tišinu i
 * natrag. Pi je jedini zadani izvor (`flight-sources.md`), a server-side transit
 * scan ovisi o njemu: bez ovoga pad struje ili mreže znači tiho ugašene alerte,
 * bez ikakvog znaka dok netko ne otvori aplikaciju.
 *
 * Novost se mjeri promjenom polja `now` u `aircraft.json`, ne vremenom prijema:
 * ako `readsb` padne, a push radi dalje, stiže uvijek isti snimak. Usporedba
 * vrijednosti, a ne s trenutnim vremenom, jer Pi sat smije odstupati.
 *
 * Plain `.cjs` da se pure logika može testirati bez pokretanja `server.js`.
 */

/**
 * Dovoljno dugo da restart Pija ili kratak prekid mreže ne budi nikoga, a
 * dovoljno kratko da se stigne reagirati prije večernjeg snimanja.
 */
const RECEIVER_OFFLINE_AFTER_MS = 5 * 60_000;

/** @param {number} startMs  start procesa, računa se kao zadnji znak života */
function createReceiverWatchdog(startMs) {
  let lastDataAtMs = startMs;
  let lastSnapshotNow = null;
  let offlineSinceMs = null;

  return {
    /** @param {unknown} snapshotNow  polje `now` iz `aircraft.json` */
    noteSnapshot(snapshotNow, atMs) {
      if (typeof snapshotNow !== "number" || !Number.isFinite(snapshotNow)) return;
      if (snapshotNow === lastSnapshotNow) return;
      lastSnapshotNow = snapshotNow;
      lastDataAtMs = atMs;
    },

    /**
     * Događaj koji treba objaviti, ili null. Ostaje isti dok ga pozivatelj ne
     * potvrdi s `acknowledge`, pa se neuspjelo slanje ponavlja samo od sebe.
     * @returns {{ status: "offline"|"online", silentMinutes: number }|null}
     */
    pendingEvent(atMs) {
      const silentMs = atMs - lastDataAtMs;
      if (offlineSinceMs == null && silentMs >= RECEIVER_OFFLINE_AFTER_MS) {
        return { status: "offline", silentMinutes: Math.round(silentMs / 60_000) };
      }
      if (offlineSinceMs != null && silentMs < RECEIVER_OFFLINE_AFTER_MS) {
        return {
          status: "online",
          silentMinutes: Math.round((atMs - offlineSinceMs) / 60_000),
        };
      }
      return null;
    },

    /** @param {"offline"|"online"} status */
    acknowledge(status) {
      offlineSinceMs = status === "offline" ? lastDataAtMs : null;
    },
  };
}

module.exports = { RECEIVER_OFFLINE_AFTER_MS, createReceiverWatchdog };
