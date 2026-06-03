import { NextRequest, NextResponse } from "next/server";
import { getAircraftList } from "@/lib/db/flightLogDb";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";

export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 30, 60_000);
  if (reject) return reject;
  const sp = req.nextUrl.searchParams;
  const daysBack = Math.min(Math.max(parseFloat(sp.get("days") ?? "7"), 0.1), 365);
  const toMs = Date.now();
  const fromMs = toMs - daysBack * 86_400_000;
  const search = sp.get("search") ?? "";
  // Cap 5000: FlightLogPanel dohvaća cijeli prozor (do ~2k aviona za 30d) i
  // filtrira/pagina lokalno. Stari cap (200) je rezao panel na fiksne 4 strane
  // bez obzira na odabrani raspon. Puna stranica (flight-log/page.tsx) ionako
  // koristi server-side paginaciju s limit=50.
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50"), 1), 5000);
  const offset = Math.max(parseInt(sp.get("offset") ?? "0"), 0);

  try {
    const result = await getAircraftList(fromMs, toMs, search, limit, offset);
    return NextResponse.json(result, { headers: NO_CACHE });
  } catch (e) {
    console.error("[flight-log/aircraft-list]", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_CACHE }
    );
  }
}
