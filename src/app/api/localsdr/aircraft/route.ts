import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SDR_URL = process.env.LOCAL_SDR_URL?.trim();

const NO_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function GET() {
  if (!SDR_URL) {
    return NextResponse.json({ now: Date.now() / 1000, aircraft: [] }, { headers: NO_CACHE });
  }
  try {
    const res = await fetch(SDR_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Local SDR upstream ${res.status}` },
        { status: res.status, headers: NO_CACHE }
      );
    }
    const data: unknown = await res.json();
    return NextResponse.json(data, { headers: NO_CACHE });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Local SDR fetch failed" },
      { status: 502, headers: NO_CACHE }
    );
  }
}
