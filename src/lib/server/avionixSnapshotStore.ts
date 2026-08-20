/**
 * Typed wrapper oko `avionixSnapshot.cjs` — snapshot koji **Avionix Nano
 * uređaj šalje** serveru.
 *
 * Logika je u `.cjs` na korijenu jer je dijeli i `server.js` (CJS poller);
 * isti obrazac kao `sdrSnapshotStore.ts`/`sdrSnapshot.cjs`. Ovdje su samo
 * tipovi i re-export.
 */

// Statički relativni require: Turbopack ga razriješi relativno na ovu datoteku
// i bundla isti `.cjs` izvor (isto kao `sdrSnapshotStore.ts`).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const snapshotModule = require("../../../avionixSnapshot.cjs") as {
  AVIONIX_SNAPSHOT_STALE_AFTER_MS: number;
  readAvionixSnapshot: () => AvionixSnapshot | null;
  writeAvionixSnapshot: (body: string) => void;
  isAvionixSnapshotFresh: (snapshot: AvionixSnapshot | null, nowMs?: number) => boolean;
};

export type AvionixSnapshot = {
  /** Kada je server zaprimio snapshot (epoch ms). */
  readonly receivedAt: number;
  /** Neizmijenjeno tijelo `/flight_updates` s uređaja. */
  readonly body: string;
};

export const AVIONIX_SNAPSHOT_STALE_AFTER_MS = snapshotModule.AVIONIX_SNAPSHOT_STALE_AFTER_MS;

export function readAvionixSnapshot(): AvionixSnapshot | null {
  return snapshotModule.readAvionixSnapshot();
}

export function writeAvionixSnapshot(body: string): void {
  snapshotModule.writeAvionixSnapshot(body);
}

/**
 * Namjerno **nije** type predicate: `false` ne znači da snapshota nema, nego
 * da je zastario — pozivatelju i tada treba pristup (npr. da javi koliko je
 * star).
 */
export function isAvionixSnapshotFresh(
  snapshot: AvionixSnapshot | null,
  nowMs?: number
): boolean {
  return snapshotModule.isAvionixSnapshotFresh(snapshot, nowMs);
}
