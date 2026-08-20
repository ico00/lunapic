import { NextResponse } from "next/server";
import { writeAvionixSnapshot } from "@/lib/server/avionixSnapshotStore";

export const dynamic = "force-dynamic";

/** Gruba gornja granica tijela — `/flight_updates` je tipično par desetaka KB. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Prijem ADS-B snapshota **s Avionix Nano uređaja** (push smjer — vidi
 * `avionixSnapshotStore.ts`).
 *
 * Uređaj svakih ~10 s POST-a sadržaj svog `/flight_updates`. Autentikacija je
 * isti obrazac kao `localsdr/ingest`: statični token u zaglavlju. Bez tokena u
 * okolini ruta je isključena (403), pa se ne može slučajno ostaviti otvorena.
 */
export async function POST(req: Request) {
  const token = process.env.AVIONIX_INGEST_TOKEN;
  if (!token || req.headers.get("x-avionix-token") !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // Validiraj da je uistinu Avionix openAir snapshot prije upisa — inače bi
  // jedan pokvaren POST zamijenio ispravan snapshot smećem. Oblik nije
  // `{aircraft:[...]}` kao tar1090 nego `{"timestamp":..., "<icao24>":[...]}`,
  // pa se provjerava `timestamp` ključ, ne `aircraft`.
  let aircraftCount: number;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.timestamp !== "string"
    ) {
      return NextResponse.json(
        { error: "Expected Avionix openAir JSON with a `timestamp` field" },
        { status: 400 }
      );
    }
    aircraftCount = Object.values(parsed).filter((v) => Array.isArray(v)).length;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    writeAvionixSnapshot(body);
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
