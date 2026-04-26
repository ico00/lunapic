import { NextResponse } from "next/server";

const OPENSKY_BASE = "https://opensky-network.org/api/states/all";

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
      headers: {
        "Content-Type": "application/json",
        "X-MoonTransit-OpenSky-Cache": "hit",
        "X-MoonTransit-OpenSky-Auth": withCred ? "yes" : "no",
      },
    });
  }

  const url = `${OPENSKY_BASE}?lamin=${encodeURIComponent(lamin)}&lomin=${encodeURIComponent(lomin)}&lamax=${encodeURIComponent(lamax)}&lomax=${encodeURIComponent(lomax)}&extended=1`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiUser && apiPass) {
    headers.Authorization = `Basic ${Buffer.from(`${apiUser}:${apiPass}`, "utf8").toString("base64")}`;
  }
  const r = await fetch(url, {
    cache: "no-store",
    headers,
  });
  const bodyText = await r.text();
  if (!r.ok) {
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
    headers: {
      "Content-Type": "application/json",
      "X-MoonTransit-OpenSky-Cache": "miss",
      "X-MoonTransit-OpenSky-Auth": withCred ? "yes" : "no",
    },
  });
}
