import { NextResponse } from "next/server";
import { recordSdrDiag } from "@/lib/server/sdrDiagStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Izvještaj je stanje + najviše 500 prekida; ovo je široka granica. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Prijem dijagnostike s Pija (`scripts/pi-net-watchdog.sh`): trenutno stanje
 * svakih ~60 s i završeni prekidi s uzrokom. Isti token kao `/api/localsdr/ingest`.
 * Pi briše poslane prekide tek na `200`, pa ih ruta smije primiti više puta
 * (`sdrDiag.cjs` ih spaja po početku i uzroku).
 */
export async function POST(req: Request) {
  const token = process.env.SDR_INGEST_TOKEN;
  if (!token || req.headers.get("x-sdr-token") !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let report: unknown;
  try {
    report = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!report || typeof report !== "object") {
    return NextResponse.json({ error: "Expected an object" }, { status: 400 });
  }

  try {
    const result = recordSdrDiag(report);
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Diag write failed" },
      { status: 500 }
    );
  }
}
