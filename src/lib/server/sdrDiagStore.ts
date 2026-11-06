/**
 * Typed wrapper oko `sdrDiag.cjs` — dijagnostika koju šalje Pi
 * (`scripts/pi-net-watchdog.sh`). Razlog i format: vidi `sdrDiag.cjs`.
 */

import type { OutageCause, PiOutage, PiStatus } from "@/lib/receiver/receiverDiagnosis";

// Statički relativni require, isti obrazac kao `sdrSnapshotStore.ts`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const diagModule = require("../../../sdrDiag.cjs") as {
  OUTAGE_CAUSES: readonly OutageCause[];
  readSdrDiag: () => SdrDiag;
  recordSdrDiag: (
    report: unknown,
    receivedAtMs?: number
  ) => { accepted: number; outages: number };
};

export type SdrDiag = {
  /** Kad je server zadnji put primio izvještaj (epoch ms), ili null. */
  readonly receivedAt: number | null;
  readonly status: PiStatus | null;
  /** Najnoviji prvi. */
  readonly outages: readonly PiOutage[];
};

export const OUTAGE_CAUSES = diagModule.OUTAGE_CAUSES;

export function readSdrDiag(): SdrDiag {
  return diagModule.readSdrDiag();
}

export function recordSdrDiag(
  report: unknown,
  receivedAtMs?: number
): { accepted: number; outages: number } {
  return diagModule.recordSdrDiag(report, receivedAtMs);
}
