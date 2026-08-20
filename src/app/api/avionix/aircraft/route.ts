import { NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import {
  isAvionixSnapshotFresh,
  readAvionixSnapshot,
} from "@/lib/server/avionixSnapshotStore";
import { createUpstreamCircuitBreaker } from "@/lib/server/upstreamCircuitBreaker";

export const dynamic = "force-dynamic";

const AVIONIX_URL_RAW = process.env.AVIONIX_URL?.trim();

// Dijeli se sa server.js (CJS poller) — isti helper kao localsdr, radi i bez
// ugrađenih kredencijala (uređaj je neautenticiran LAN endpoint, CORS `*`).
// Statički relativni require: Turbopack ga razriješi relativno na ovu
// datoteku (dinamički cwd-based require Turbopack prepiše i build pukne).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseSdrUrl } = require("../../../../../sdrUrl.cjs") as {
  parseSdrUrl: (raw: string) => { url: string; authHeader: string | null };
};

const parsedAvionix = AVIONIX_URL_RAW
  ? parseSdrUrl(AVIONIX_URL_RAW)
  : { url: undefined as string | undefined, authHeader: null };
const AVIONIX_URL = parsedAvionix.url;
const AVIONIX_AUTH_HEADERS: Record<string, string> = parsedAvionix.authHeader
  ? { Connection: "close", Authorization: parsedAvionix.authHeader }
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
 */
function describeFetchError(e: unknown): string {
  if (!(e instanceof Error)) {
    return "Avionix fetch failed";
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
 * Pull smjer je local-dev-only fallback (uređaj na istoj mreži kao dev
 * računalo) — u produkciji uređaj sam pusha preko `/api/avionix/ingest`.
 * Isti prozor kao localsdr (3, 30s): vlastiti hardver na lokalnoj mreži, brz
 * povratak. Push snapshot se provjerava **prije** breakera.
 */
const AVIONIX_BREAKER_FAILURE_THRESHOLD = 3;
const AVIONIX_BREAKER_OPEN_MS = 30_000;

const avionixBreaker = createUpstreamCircuitBreaker({
  failureThreshold: AVIONIX_BREAKER_FAILURE_THRESHOLD,
  openMs: AVIONIX_BREAKER_OPEN_MS,
});

// 10s in-memory cache protects the device from concurrent/rapid client requests.
const CACHE_TTL_MS = 10_000;
let cachedBody: string | null = null;
let cacheExpiresAt = 0;

export async function GET(req: Request) {
  const reject = rejectIfRateLimited(req, 20, 60_000, "avionix/aircraft");
  if (reject) return reject;

  // 1) Push smjer (produkcija): uređaj šalje snapshot na `/api/avionix/ingest`.
  const snapshot = readAvionixSnapshot();
  if (snapshot && isAvionixSnapshotFresh(snapshot)) {
    return new NextResponse(snapshot.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Avionix-Source": "push",
        ...NO_CACHE,
      },
    });
  }

  // 2) Pull smjer (lokalni dev na istoj mreži, ili dok uređaj još ne šalje).
  if (!AVIONIX_URL || !AVIONIX_URL_RAW) {
    const staleAgeSec =
      snapshot != null ? Math.round((Date.now() - snapshot.receivedAt) / 1000) : null;
    return NextResponse.json(
      {
        timestamp: String(Date.now()),
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
      headers: { "Content-Type": "application/json", "X-Avionix-Cache": "hit" },
    });
  }

  const gate = avionixBreaker.check();
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: "Avionix receiver unreachable",
        hint: `Pull failed ${AVIONIX_BREAKER_FAILURE_THRESHOLD}x in a row; pausing calls for ${Math.round(AVIONIX_BREAKER_OPEN_MS / 1000)}s.`,
        retryAfterMs: gate.retryAfterMs,
      },
      {
        status: 503,
        headers: {
          "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)),
          "X-Avionix-Circuit": "open",
          ...NO_CACHE,
        },
      }
    );
  }

  try {
    const res = await fetch(AVIONIX_URL, {
      cache: "no-store",
      headers: AVIONIX_AUTH_HEADERS,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      discardBody(res);
      avionixBreaker.recordFailure();
      return NextResponse.json(
        { error: `Avionix upstream ${res.status}` },
        {
          status: res.status,
          headers: { "X-Avionix-Circuit": avionixBreaker.state(), ...NO_CACHE },
        }
      );
    }
    const bodyText = await res.text();
    avionixBreaker.recordSuccess();
    cachedBody = bodyText;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return new NextResponse(bodyText, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Avionix-Cache": "miss" },
    });
  } catch (e) {
    avionixBreaker.recordFailure();
    return NextResponse.json(
      { error: describeFetchError(e) },
      {
        status: 502,
        headers: { "X-Avionix-Circuit": avionixBreaker.state(), ...NO_CACHE },
      }
    );
  }
}
