import { NextResponse } from "next/server";
import { diagnoseReceiver, type SnapshotMeta } from "@/lib/receiver/receiverDiagnosis";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { readSdrDiag } from "@/lib/server/sdrDiagStore";
import { readSdrSnapshot } from "@/lib/server/sdrSnapshotStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Zašto LunaPic ADS-B ne radi, i nedavni prekidi s uzrokom. Čita je panel
 * Flight source (`useReceiverDiagnosis`). Bez tajni: signal, uptime i povijest
 * prekida, bez adresa i imena mreže.
 */
export async function GET(req: Request) {
  const reject = rejectIfRateLimited(req, 20, 60_000, "localsdr/status");
  if (reject) return reject;

  const snap = readSdrSnapshot();
  let snapshot: SnapshotMeta | null = null;
  if (snap) {
    let readsbNowSec: number | null = null;
    let aircraftCount: number | null = null;
    try {
      const parsed = JSON.parse(snap.body) as { now?: unknown; aircraft?: unknown };
      if (typeof parsed.now === "number" && Number.isFinite(parsed.now)) {
        readsbNowSec = parsed.now;
      }
      if (Array.isArray(parsed.aircraft)) aircraftCount = parsed.aircraft.length;
    } catch {
      // Ingest validira JSON prije upisa; pokvaren snimak tretiramo kao bez metapodataka.
    }
    snapshot = { receivedAt: snap.receivedAt, readsbNowSec, aircraftCount };
  }

  const diagnosis = diagnoseReceiver({
    snapshot,
    diag: readSdrDiag(),
    nowMs: Date.now(),
  });
  return NextResponse.json(diagnosis, {
    headers: { "Cache-Control": "no-store" },
  });
}
