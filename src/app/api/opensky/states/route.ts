import { NextResponse } from "next/server";

const OPENSKY_BASE = "https://opensky-network.org/api/states/all";

/**
 * Proxy prema OpenSky (izbjegava CORS; klijent zove samo ovu rutu).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lamin = searchParams.get("lamin");
  const lomin = searchParams.get("lomin");
  const lamax = searchParams.get("lamax");
  const lomax = searchParams.get("lomax");
  if (!lamin || !lomin || !lamax || !lomax) {
    return NextResponse.json(
      { error: "Nedostaju lamin, lomin, lamax, lomax." },
      { status: 400 }
    );
  }
  const url = `${OPENSKY_BASE}?lamin=${encodeURIComponent(lamin)}&lomin=${encodeURIComponent(lomin)}&lamax=${encodeURIComponent(lamax)}&lomax=${encodeURIComponent(lomax)}`;
  const r = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: `OpenSky ${r.status}`, body: await r.text() },
      { status: 502 }
    );
  }
  const data: unknown = await r.json();
  return NextResponse.json(data);
}
