import { NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";

export const dynamic = "force-dynamic";

const SDR_URL_RAW = process.env.LOCAL_SDR_URL?.trim();

// Dijeli se sa server.js (CJS poller) — jedini izvor istine za SDR URL parsiranje.
// Statički relativni require: Turbopack ga razriješi relativno na ovu datoteku i
// bundla isti .cjs izvor. (Dinamički require(process.cwd()...) Turbopack rewrite-a
// u /ROOT i build pukne — zato ne koristiti cwd-path ovdje.)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseSdrUrl } = require("../../../../../sdrUrl.cjs") as {
  parseSdrUrl: (raw: string) => { url: string; authHeader: string | null };
};

const parsedSdr = SDR_URL_RAW
  ? parseSdrUrl(SDR_URL_RAW)
  : { url: undefined as string | undefined, authHeader: null };
const SDR_URL = parsedSdr.url;
const SDR_AUTH_HEADERS: Record<string, string> = parsedSdr.authHeader
  ? { Authorization: parsedSdr.authHeader }
  : {};

const NO_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

// 10s in-memory cache protects the Pi from concurrent or rapid client requests
const CACHE_TTL_MS = 10_000;
let cachedBody: string | null = null;
let cacheExpiresAt = 0;

export async function GET(req: Request) {
  const reject = rejectIfRateLimited(req, 20, 60_000);
  if (reject) return reject;

  if (!SDR_URL || !SDR_URL_RAW) {
    return NextResponse.json({ now: Date.now() / 1000, aircraft: [] }, { headers: NO_CACHE });
  }

  const now = Date.now();
  if (cachedBody && now < cacheExpiresAt) {
    return new NextResponse(cachedBody, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-SDR-Cache": "hit" },
    });
  }

  try {
    const res = await fetch(SDR_URL, {
      cache: "no-store",
      headers: SDR_AUTH_HEADERS,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Local SDR upstream ${res.status}` },
        { status: res.status, headers: NO_CACHE }
      );
    }
    const bodyText = await res.text();
    cachedBody = bodyText;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return new NextResponse(bodyText, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-SDR-Cache": "miss" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Local SDR fetch failed" },
      { status: 502, headers: NO_CACHE }
    );
  }
}
