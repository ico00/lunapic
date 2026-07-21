/**
 * Typed wrapper oko `sdrSnapshot.cjs` — snapshot koji **Pi šalje** serveru.
 *
 * Logika je u `.cjs` na korijenu jer je dijeli i `server.js` (CJS poller);
 * isti obrazac kao `sdrUrl.cjs`. Ovdje su samo tipovi i re-export.
 * Razlog za push smjer i za datoteku umjesto memorije: vidi `sdrSnapshot.cjs`.
 */

// Statički relativni require: Turbopack ga razriješi relativno na ovu datoteku
// i bundla isti `.cjs` izvor (isto kao u `api/localsdr/aircraft/route.ts`).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const snapshotModule = require("../../../sdrSnapshot.cjs") as {
  SNAPSHOT_STALE_AFTER_MS: number;
  readSdrSnapshot: () => SdrSnapshot | null;
  writeSdrSnapshot: (body: string) => void;
  isSnapshotFresh: (snapshot: SdrSnapshot | null, nowMs?: number) => boolean;
};

export type SdrSnapshot = {
  /** Kada je server zaprimio snapshot (epoch ms). */
  readonly receivedAt: number;
  /** Neizmijenjeno tijelo `aircraft.json` s Pija. */
  readonly body: string;
};

export const SNAPSHOT_STALE_AFTER_MS = snapshotModule.SNAPSHOT_STALE_AFTER_MS;

export function readSdrSnapshot(): SdrSnapshot | null {
  return snapshotModule.readSdrSnapshot();
}

export function writeSdrSnapshot(body: string): void {
  snapshotModule.writeSdrSnapshot(body);
}

/**
 * Namjerno **nije** type predicate: `false` ne znači da snapshota nema, nego da
 * je zastario — pozivatelju i tada treba pristup (npr. da javi koliko je star).
 */
export function isSnapshotFresh(
  snapshot: SdrSnapshot | null,
  nowMs?: number
): boolean {
  return snapshotModule.isSnapshotFresh(snapshot, nowMs);
}
