import { NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { isSnapshotFresh, readSdrSnapshot } from "@/lib/server/sdrSnapshotStore";
import { createUpstreamCircuitBreaker } from "@/lib/server/upstreamCircuitBreaker";

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
/**
 * `Connection: close` — keep-alive prema Piju ne donosi ništa (odgovor je
 * keširan 10 s), a kroz Tailscale Funnel nosi rizik da undici reciklira
 * poluotvoreni socket nakon što tunel tiho padne.
 */
const SDR_AUTH_HEADERS: Record<string, string> = parsedSdr.authHeader
  ? { Connection: "close", Authorization: parsedSdr.authHeader }
  : { Connection: "close" };

/**
 * Node `fetch` (undici) ne vraća konekciju u pool dok se tijelo ne pročita ili
 * ne uništi — `return` bez čitanja trajno zauzme jednu konekciju po originu.
 */
function discardBody(res: Response): void {
  try {
    void res.body?.cancel();
  } catch {
    /* već potrošeno ili nema tijela */
  }
}

/**
 * `fetch` u Nodeu baca generički `TypeError: fetch failed`, a pravi razlog
 * (`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`, TLS greška…) skriva u `cause`.
 * Bez ovoga se iz poruke ne može razlikovati DNS od firewalla od pale Funnel veze.
 */
function describeFetchError(e: unknown): string {
  if (!(e instanceof Error)) {
    return "Local SDR fetch failed";
  }
  const cause = (e as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return code ? `${e.message}: ${code} — ${cause.message}` : `${e.message}: ${cause.message}`;
  }
  return e.message;
}

const NO_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

/**
 * Pull smjer prema Piju je najčešći izvor tihe buke: dok je prijemnik ugašen ili
 * se seli, svaki poll tick čeka DNS/TCP timeout i završi kao 502 u konzoli.
 * Nakon 3 uzastopna neuspjeha stanemo na 30 s.
 *
 * Kraći prozor nego kod `adsbone/point` (60 s) jer je ovo prijemnik u vlastitoj
 * mreži — kad se vrati, želimo ga vidjeti brzo, a promet je lokalan i besplatan.
 * Push snapshot se provjerava **prije** breakera, pa Pi koji ponovno šalje
 * podatke prolazi odmah, bez obzira na stanje kruga.
 */
const SDR_BREAKER_FAILURE_THRESHOLD = 3;
const SDR_BREAKER_OPEN_MS = 30_000;

const sdrBreaker = createUpstreamCircuitBreaker({
  failureThreshold: SDR_BREAKER_FAILURE_THRESHOLD,
  openMs: SDR_BREAKER_OPEN_MS,
});

// 10s in-memory cache protects the Pi from concurrent or rapid client requests
const CACHE_TTL_MS = 10_000;
let cachedBody: string | null = null;
let cacheExpiresAt = 0;

export async function GET(req: Request) {
  const reject = rejectIfRateLimited(req, 20, 60_000, "localsdr/aircraft");
  if (reject) return reject;

  // 1) Push smjer (produkcija): Pi šalje snapshot na `/api/localsdr/ingest`.
  //    Ima prednost jer ne ovisi o javnoj dostupnosti Pija.
  const snapshot = readSdrSnapshot();
  if (snapshot && isSnapshotFresh(snapshot)) {
    return new NextResponse(snapshot.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-SDR-Source": "push",
        ...NO_CACHE,
      },
    });
  }

  // 2) Pull smjer (lokalni dev na istoj mreži, ili dok Pi još ne šalje).
  if (!SDR_URL || !SDR_URL_RAW) {
    const staleAgeSec =
      snapshot != null ? Math.round((Date.now() - snapshot.receivedAt) / 1000) : null;
    return NextResponse.json(
      {
        now: Date.now() / 1000,
        aircraft: [],
        ...(staleAgeSec != null
          ? { stale: true, lastSnapshotAgeSec: staleAgeSec }
          : {}),
      },
      { headers: NO_CACHE }
    );
  }

  const now = Date.now();
  if (cachedBody && now < cacheExpiresAt) {
    return new NextResponse(cachedBody, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-SDR-Cache": "hit" },
    });
  }

  const gate = sdrBreaker.check();
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: "Local SDR receiver unreachable",
        hint: `Pull failed ${SDR_BREAKER_FAILURE_THRESHOLD}x in a row; pausing calls for ${Math.round(SDR_BREAKER_OPEN_MS / 1000)}s.`,
        retryAfterMs: gate.retryAfterMs,
      },
      {
        status: 503,
        headers: {
          "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)),
          "X-SDR-Circuit": "open",
          ...NO_CACHE,
        },
      }
    );
  }

  try {
    const res = await fetch(SDR_URL, {
      cache: "no-store",
      headers: SDR_AUTH_HEADERS,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      discardBody(res);
      sdrBreaker.recordFailure();
      return NextResponse.json(
        { error: `Local SDR upstream ${res.status}` },
        {
          status: res.status,
          headers: { "X-SDR-Circuit": sdrBreaker.state(), ...NO_CACHE },
        }
      );
    }
    const bodyText = await res.text();
    sdrBreaker.recordSuccess();
    cachedBody = bodyText;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return new NextResponse(bodyText, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-SDR-Cache": "miss" },
    });
  } catch (e) {
    sdrBreaker.recordFailure();
    return NextResponse.json(
      { error: describeFetchError(e) },
      {
        status: 502,
        headers: { "X-SDR-Circuit": sdrBreaker.state(), ...NO_CACHE },
      }
    );
  }
}
