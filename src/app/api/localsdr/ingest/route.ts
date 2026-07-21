import { NextResponse } from "next/server";
import { writeSdrSnapshot } from "@/lib/server/sdrSnapshotStore";

export const dynamic = "force-dynamic";

/** Gruba gornja granica tijela — `aircraft.json` je tipično 20–300 KB. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Prijem ADS-B snapshota **s Pija** (push smjer — vidi `sdrSnapshotStore.ts`).
 *
 * Pi svakih ~15 s POST-a sadržaj svog `aircraft.json`. Autentikacija je isti
 * obrazac kao `api/transit/scan`: statični token u zaglavlju. Bez tokena u
 * okolini ruta je isključena (403), pa se ne može slučajno ostaviti otvorena.
 */
export async function POST(req: Request) {
  const token = process.env.SDR_INGEST_TOKEN;
  if (!token || req.headers.get("x-sdr-token") !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // Validiraj da je uistinu tar1090 snapshot prije upisa — inače bi jedan
  // pokvaren POST zamijenio ispravan snapshot smećem.
  let aircraftCount: number;
  try {
    const parsed = JSON.parse(body) as { aircraft?: unknown };
    if (!Array.isArray(parsed.aircraft)) {
      return NextResponse.json(
        { error: "Expected tar1090 JSON with an `aircraft` array" },
        { status: 400 }
      );
    }
    aircraftCount = parsed.aircraft.length;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    writeSdrSnapshot(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Snapshot write failed" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, aircraft: aircraftCount },
    { headers: { "Cache-Control": "no-store" } }
  );
}
