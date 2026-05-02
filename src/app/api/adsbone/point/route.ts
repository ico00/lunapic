import { NextResponse } from "next/server";

import { ADSB_LIVE_POINT_BASES } from "@/lib/flight/adsbone/adsbLiveUpstreamBases";

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

const UPSTREAM_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "MoonTransit/1.0 (+https://github.com/ico00/lunapic; ADS-B live proxy)",
};

/**
 * Proxy na ADSBExchange v2 point feed (bez CORS-a). Pokušava **redom**
 * `api.adsb.one` pa `api.airplanes.live` jer Cloudflare često blokira prvi s
 * hosting IP-eva. Kratka predmemorija po (lat, lng, radius).
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

  let lastStatus = 502;
  let lastBody = "";

  for (const base of ADSB_LIVE_POINT_BASES) {
    const upstreamUrl = `${base}/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}/${encodeURIComponent(radiusNm)}`;
    try {
      const r = await fetch(upstreamUrl, {
        cache: "no-store",
        headers: UPSTREAM_HEADERS,
      });
      const bodyText = await r.text();
      if (r.ok) {
        cacheSet(cKey, bodyText);
        return new NextResponse(bodyText, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-MoonTransit-AdsbOne-Cache": "miss",
            "Cache-Control": CDN_CACHE_CONTROL,
          },
        });
      }
      lastStatus = r.status;
      lastBody = bodyText;
      if (r.status === 429) {
        return NextResponse.json(
          {
            error: `ADS-B live ${r.status}`,
            body: bodyText.slice(0, 500),
            hint:
              "Upstream rate limit (~1 req/s per IP). Wait a few seconds; the app caches responses ~30s per area.",
          },
          { status: 429, headers: { "X-MoonTransit-AdsbOne-Cache": "none" } }
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[MoonTransit ADSB live] fetch error", {
        base,
        msg,
      });
      lastStatus = 502;
      lastBody = msg;
    }
  }

  const cfBlock =
    lastStatus === 403 && /cloudflare|Attention Required/i.test(lastBody);
  return NextResponse.json(
    {
      error: `ADS-B live ${lastStatus}`,
      body: lastBody.slice(0, 500),
      hint: cfBlock
        ? "All upstream mirrors rejected this server (often Cloudflare). The browser tries the same mirrors directly first."
        : "All upstream mirrors failed for this request.",
    },
    { status: 502, headers: { "X-MoonTransit-AdsbOne-Cache": "none" } }
  );
}
