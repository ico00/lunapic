import { NextResponse } from "next/server";

const OPENSKY_BASE = "https://opensky-network.org/api/states/all";
/** Ispod cca 10s (Vercel Hobby `maxDuration`) — ostavljena margina za `text()` + JSON. */
const DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS = 9_500;
const parsedTimeout = Number(process.env.OPENSKY_UPSTREAM_TIMEOUT_MS);
const UPSTREAM_FETCH_TIMEOUT_MS =
  Number.isFinite(parsedTimeout) && parsedTimeout >= 2_000 && parsedTimeout <= 9_500
    ? Math.floor(parsedTimeout)
    : DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS;
const CDN_CACHE_CONTROL =
  "s-maxage=15, stale-while-revalidate=30";

export const maxDuration = 10;

/** Koliko dugo isti (grub) bbox dijeli jedan upstream odgovor bez novog poziva. */
const PROXY_CACHE_TTL_MS = 30_000;
const PROXY_CACHE_MAX_KEYS = 40;

type CacheEntry = { expiresAt: number; body: string };

const bboxCache = new Map<string, CacheEntry>();

function bboxCacheKey(
  lamin: string,
  lomin: string,
  lamax: string,
  lomax: string
): string {
  const r = (x: string) => Number(x).toFixed(2);
  return `${r(lamin)}|${r(lomin)}|${r(lamax)}|${r(lomax)}`;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [k, v] of bboxCache) {
    if (v.expiresAt <= now) {
      bboxCache.delete(k);
    }
  }
  while (bboxCache.size > PROXY_CACHE_MAX_KEYS) {
    const first = bboxCache.keys().next().value;
    if (!first) {
      break;
    }
    bboxCache.delete(first);
  }
}

function cacheSet(key: string, body: string): void {
  pruneCache();
  bboxCache.set(key, { expiresAt: Date.now() + PROXY_CACHE_TTL_MS, body });
  while (bboxCache.size > PROXY_CACHE_MAX_KEYS) {
    const first = bboxCache.keys().next().value;
    if (!first) {
      break;
    }
    bboxCache.delete(first);
  }
}

function jsonHeaders(
  withCred: boolean,
  cache: "hit" | "miss" | "none",
  source?: "timeout-fallback"
): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "X-MoonTransit-OpenSky-Cache": cache,
    "X-MoonTransit-OpenSky-Auth": withCred ? "yes" : "no",
    "Cache-Control": CDN_CACHE_CONTROL,
  };
  if (source) {
    h["X-MoonTransit-OpenSky-Source"] = source;
  }
  return h;
}

function emptyOkResponse(
  withCred: boolean,
  source: "timeout-fallback"
): NextResponse {
  const time = Math.floor(Date.now() / 1000);
  return NextResponse.json(
    { time, states: null, source },
    { status: 200, headers: jsonHeaders(withCred, "none", source) }
  );
}

/**
 * Proxy prema OpenSky (izbjegava CORS; klijent zove samo ovu rutu).
 * `extended=1` — uključuje polje `category` (tip/klasa zrakoplova) u state vektoru.
 *
 * Kratkotrajna predmemorija po grubom bbox-u smanjuje 429 kada klijent šalje više
 * zahtjeva u kratkom roku (pan, više komponenti, dev Strict Mode).
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

  const apiUser = process.env.OPENSKY_API_USER?.trim();
  const apiPass = process.env.OPENSKY_API_PASSWORD?.trim();
  const withCred = Boolean(apiUser && apiPass);

  const cKey = bboxCacheKey(lamin, lomin, lamax, lomax);
  const cached = bboxCache.get(cKey);
  if (cached && cached.expiresAt > Date.now()) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: jsonHeaders(withCred, "hit"),
    });
  }

  const url = `${OPENSKY_BASE}?lamin=${encodeURIComponent(lamin)}&lomin=${encodeURIComponent(lomin)}&lamax=${encodeURIComponent(lamax)}&lomax=${encodeURIComponent(lomax)}&extended=1`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiUser && apiPass) {
    headers.Authorization = `Basic ${Buffer.from(`${apiUser}:${apiPass}`, "utf8").toString("base64")}`;
  }

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), UPSTREAM_FETCH_TIMEOUT_MS);

  try {
    const r = await fetch(url, {
      cache: "no-store",
      headers,
      signal: ac.signal,
    });
    clearTimeout(timeoutId);
    const bodyText = await r.text();
    if (!r.ok) {
      const likelyAuth = r.status === 401 || r.status === 403;
      const missingCred = !withCred;
      if (likelyAuth && missingCred) {
        console.error(
          "[MoonTransit OpenSky] upstream auth error without API credentials — set OPENSKY_API_USER and OPENSKY_API_PASSWORD",
          { status: r.status, bodySnippet: bodyText.slice(0, 240) }
        );
      } else if (likelyAuth && withCred) {
        console.error(
          "[MoonTransit OpenSky] upstream rejected credentials (401/403)",
          { status: r.status, bodySnippet: bodyText.slice(0, 240) }
        );
      } else if (r.status >= 500) {
        console.error(
          "[MoonTransit OpenSky] upstream server error (OpenSky may be down)",
          { status: r.status, bodySnippet: bodyText.slice(0, 240) }
        );
      } else if (r.status === 429) {
        console.error(
          "[MoonTransit OpenSky] rate limited (429)",
          { withCred, bodySnippet: bodyText.slice(0, 240) }
        );
      } else {
        console.error("[MoonTransit OpenSky] upstream error", {
          status: r.status,
          withCred,
          bodySnippet: bodyText.slice(0, 240),
        });
      }
      const status = r.status === 429 ? 429 : 502;
      return NextResponse.json(
        {
          error: `OpenSky ${r.status}`,
          body: bodyText.slice(0, 500),
          hint:
            r.status === 429
              ? withCred
                ? "OpenSky rate limit. Wait 1–2 min; avoid multiple dev tabs; proxy caches 30s per map area. Confirm API password (not only web login if OpenSky requires an API token)."
                : "OpenSky anonymous rate limit. Set OPENSKY_API_USER and OPENSKY_API_PASSWORD in .env.local (free account), restart dev server."
              : undefined,
        },
        {
          status,
          headers: { "X-MoonTransit-OpenSky-Auth": withCred ? "yes" : "no" },
        }
      );
    }

    cacheSet(cKey, bodyText);
    return new NextResponse(bodyText, {
      status: 200,
      headers: jsonHeaders(withCred, "miss"),
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isAbort =
      err instanceof Error && err.name === "AbortError";
    const isNetwork =
      err instanceof TypeError &&
      typeof err.message === "string" &&
      /fetch|network|Load failed|Failed to fetch/i.test(err.message);

    if (isAbort) {
      console.error(
        `[MoonTransit OpenSky] upstream timeout or abort (limit ${UPSTREAM_FETCH_TIMEOUT_MS}ms)`,
        { timeoutMs: UPSTREAM_FETCH_TIMEOUT_MS, withCred }
      );
    } else if (isNetwork) {
      console.error(
        "[MoonTransit OpenSky] network error while contacting OpenSky",
        { message: err instanceof Error ? err.message : String(err), withCred }
      );
    } else {
      console.error(
        "[MoonTransit OpenSky] unexpected fetch error",
        { err, withCred }
      );
    }
    return emptyOkResponse(withCred, "timeout-fallback");
  }
}
