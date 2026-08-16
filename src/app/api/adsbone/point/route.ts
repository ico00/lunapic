import { NextResponse } from "next/server";

import { checkRateLimit, getClientIp } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";

import { ADSB_LIVE_POINT_BASES } from "@/lib/flight/adsbone/adsbLiveUpstreamBases";

const CDN_CACHE_CONTROL = "s-maxage=20, stale-while-revalidate=40";

export const maxDuration = 10;
export const preferredRegion = "fra1";

const PROXY_CACHE_TTL_MS = 12_000;
const PROXY_CACHE_MAX_KEYS = 48;

const pointCache = createTtlBodyCache(PROXY_CACHE_TTL_MS, PROXY_CACHE_MAX_KEYS);

function cacheKey(lat: string, lng: string, radiusNm: string): string {
  return `${Number(lat).toFixed(3)}|${Number(lng).toFixed(3)}|${Number(radiusNm).toFixed(1)}`;
}

const UPSTREAM_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "MoonTransit/1.0 (+https://github.com/ico00/lunapic; ADS-B live proxy)",
};

/**
 * Proxy na ADSBExchange v2 point feed (bez CORS-a). Prolazi redom kroz
 * `ADSB_LIVE_POINT_BASES` (trenutno samo `api.adsb.lol`) i vraća prvi uspješan
 * odgovor. Kratka predmemorija po (lat, lng, radius).
 */
export async function GET(req: Request) {
  const rl = checkRateLimit(getClientIp(req), 60, 60_000, "adsbone/point");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Previše zahtjeva. Pokušaj ponovo za nekoliko sekundi." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
          "Content-Type": "application/json",
        },
      }
    );
  }

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
  const hitBody = pointCache.get(cKey);
  if (hitBody !== null) {
    return new NextResponse(hitBody, {
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
        pointCache.set(cKey, bodyText);
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
              "Upstream rate limit (~1 req/s per IP). Wait a few seconds; the app caches responses ~12s per area.",
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
        ? "The upstream rejected this server (often Cloudflare on datacenter IPs)."
        : "No upstream in ADSB_LIVE_POINT_BASES answered this request.",
    },
    { status: 502, headers: { "X-MoonTransit-AdsbOne-Cache": "none" } }
  );
}
