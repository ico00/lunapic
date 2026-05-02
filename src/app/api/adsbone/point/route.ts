import { NextResponse } from "next/server";

const UPSTREAM_BASE = "https://api.adsb.one/v2/point";
const CDN_CACHE_CONTROL = "s-maxage=20, stale-while-revalidate=40";

export const maxDuration = 10;
export const preferredRegion = "fra1";

const PROXY_CACHE_TTL_MS = 30_000;
const PROXY_CACHE_MAX_KEYS = 48;

type CacheEntry = { expiresAt: number; body: string };

const pointCache = new Map<string, CacheEntry>();

function cacheKey(lat: string, lng: string, radiusNm: string): string {
  return `${Number(lat).toFixed(3)}|${Number(lng).toFixed(3)}|${Number(radiusNm).toFixed(1)}`;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [k, v] of pointCache) {
    if (v.expiresAt <= now) {
      pointCache.delete(k);
    }
  }
  while (pointCache.size > PROXY_CACHE_MAX_KEYS) {
    const first = pointCache.keys().next().value;
    if (!first) {
      break;
    }
    pointCache.delete(first);
  }
}

function cacheSet(key: string, body: string): void {
  pruneCache();
  pointCache.set(key, {
    expiresAt: Date.now() + PROXY_CACHE_TTL_MS,
    body,
  });
}

/**
 * Proxy na api.adsb.one (bez CORS-a). ADS-B One: max ~1 zahtjev/s po IP — kratka
 * predmemorija po (lat, lng, radius) smanjuje pritisak.
 *
 * @see https://github.com/adsb-one/api
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const radiusRaw = searchParams.get("radiusNm");
  if (!latRaw || !lngRaw || !radiusRaw) {
    return NextResponse.json(
      { error: "Missing lat, lng, or radiusNm." },
      { status: 400 }
    );
  }
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  const radiusNm = Number(radiusRaw);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(radiusNm) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    radiusNm < 1 ||
    radiusNm > 250
  ) {
    return NextResponse.json(
      { error: "Invalid lat, lng, or radiusNm (radius 1–250 nm)." },
      { status: 400 }
    );
  }

  const cKey = cacheKey(latRaw, lngRaw, radiusRaw);
  const hit = pointCache.get(cKey);
  if (hit && hit.expiresAt > Date.now()) {
    return new NextResponse(hit.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-MoonTransit-AdsbOne-Cache": "hit",
        "Cache-Control": CDN_CACHE_CONTROL,
      },
    });
  }

  const url = `${UPSTREAM_BASE}/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}/${encodeURIComponent(radiusNm)}`;
  try {
    const r = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const bodyText = await r.text();
    if (!r.ok) {
      const status = r.status === 429 ? 429 : 502;
      return NextResponse.json(
        {
          error: `ADS-B One ${r.status}`,
          body: bodyText.slice(0, 500),
          hint:
            r.status === 429
              ? "Upstream rate limit (~1 req/s per IP). Wait a few seconds; the app caches responses ~30s per area."
              : undefined,
        },
        { status, headers: { "X-MoonTransit-AdsbOne-Cache": "none" } }
      );
    }
    cacheSet(cKey, bodyText);
    return new NextResponse(bodyText, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-MoonTransit-AdsbOne-Cache": "miss",
        "Cache-Control": CDN_CACHE_CONTROL,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[MoonTransit ADSB One] fetch error", { msg });
    return NextResponse.json(
      { error: "ADS-B One network error", hint: msg.slice(0, 200) },
      { status: 502 }
    );
  }
}
