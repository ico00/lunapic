import { NextResponse } from "next/server";

import { checkRateLimit, getClientIp } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";
import { createUpstreamCircuitBreaker } from "@/lib/server/upstreamCircuitBreaker";

import { ADSB_LIVE_POINT_BASES } from "@/lib/flight/adsbone/adsbLiveUpstreamBases";

const CDN_CACHE_CONTROL = "s-maxage=20, stale-while-revalidate=40";

export const maxDuration = 10;
export const preferredRegion = "fra1";

const PROXY_CACHE_TTL_MS = 12_000;
const PROXY_CACHE_MAX_KEYS = 48;

/** Iznad `maxDuration` nema smisla čekati — radije brzi 504 nego mrtav zahtjev. */
const UPSTREAM_TIMEOUT_MS = 8_000;

/**
 * Nakon 3 uzastopna neuspjeha stani na 60 s. Klijent polla svakih 30 s po tabu,
 * pa mrtav upstream inače dobiva zahtjev sa svakog otvorenog browsera u
 * nedogled (vidi PR #25 — adsb.one/airplanes.live su mjesecima vraćali 403).
 */
const BREAKER_FAILURE_THRESHOLD = 3;
const BREAKER_OPEN_MS = 60_000;

const pointCache = createTtlBodyCache(PROXY_CACHE_TTL_MS, PROXY_CACHE_MAX_KEYS);

const breaker = createUpstreamCircuitBreaker({
  failureThreshold: BREAKER_FAILURE_THRESHOLD,
  openMs: BREAKER_OPEN_MS,
});

/**
 * Status koji vraćamo pozivatelju za dani upstream status.
 *
 * Ranije je **svaki** neuspjeh izlazio kao 502, pa se u DevToolsu nije vidjelo
 * je li upstream odbio pristup (403), je li nas ograničio (429) ili je stvarno
 * pao (5xx). Statusi koji nose informaciju klijentu prolaze kroz; ostalo je
 * 502, jer je to zaista greška gatewaya, a ne pozivatelja.
 */
function proxyStatusForUpstream(upstreamStatus: number): number {
  if ([400, 403, 404, 429, 451].includes(upstreamStatus)) {
    return upstreamStatus;
  }
  return 502;
}

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

  const gate = breaker.check();
  if (!gate.allowed) {
    // Krug je otvoren — ne diramo upstream, odgovaramo odmah.
    return NextResponse.json(
      {
        error: "ADS-B live upstream unavailable",
        hint: `Upstream failed ${BREAKER_FAILURE_THRESHOLD}x in a row; pausing calls for ${Math.round(BREAKER_OPEN_MS / 1000)}s.`,
        retryAfterMs: gate.retryAfterMs,
      },
      {
        status: 503,
        headers: {
          "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)),
          "X-MoonTransit-AdsbOne-Cache": "none",
          "X-MoonTransit-Circuit": "open",
        },
      }
    );
  }

  /** 0 = upstream nije uopće odgovorio (mrežna greška / timeout). */
  let lastStatus = 0;
  let lastBody = "";
  let lastTimedOut = false;

  for (const base of ADSB_LIVE_POINT_BASES) {
    const upstreamUrl = `${base}/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}/${encodeURIComponent(radiusNm)}`;
    try {
      const r = await fetch(upstreamUrl, {
        cache: "no-store",
        headers: UPSTREAM_HEADERS,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      const bodyText = await r.text();
      if (r.ok) {
        breaker.recordSuccess();
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
        // Rate limit je upstream odbijanje kao i svako drugo: tri zaredom znače
        // da ga i dalje gazimo, pa neka breaker stane.
        breaker.recordFailure();
        return NextResponse.json(
          {
            error: `ADS-B live ${r.status}`,
            upstreamStatus: r.status,
            body: bodyText.slice(0, 500),
            hint:
              "Upstream rate limit (~1 req/s per IP). Wait a few seconds; the app caches responses ~12s per area.",
          },
          {
            status: 429,
            headers: {
              "X-MoonTransit-AdsbOne-Cache": "none",
              "X-MoonTransit-Upstream-Status": String(r.status),
            },
          }
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const timedOut =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError");
      console.error("[MoonTransit ADSB live] fetch error", {
        base,
        msg,
        timedOut,
      });
      lastStatus = 0;
      lastTimedOut = timedOut;
      lastBody = msg;
    }
  }

  breaker.recordFailure();

  const cfBlock =
    lastStatus === 403 && /cloudflare|Attention Required/i.test(lastBody);
  const proxyStatus =
    lastStatus === 0
      ? lastTimedOut
        ? 504
        : 502
      : proxyStatusForUpstream(lastStatus);
  return NextResponse.json(
    {
      error:
        lastStatus === 0
          ? lastTimedOut
            ? "ADS-B live timeout"
            : "ADS-B live unreachable"
          : `ADS-B live ${lastStatus}`,
      upstreamStatus: lastStatus === 0 ? null : lastStatus,
      body: lastBody.slice(0, 500),
      hint: cfBlock
        ? "The upstream rejected this server (often Cloudflare on datacenter IPs)."
        : "No upstream in ADSB_LIVE_POINT_BASES answered this request.",
    },
    {
      status: proxyStatus,
      headers: {
        "X-MoonTransit-AdsbOne-Cache": "none",
        "X-MoonTransit-Upstream-Status": lastStatus === 0 ? "none" : String(lastStatus),
        "X-MoonTransit-Circuit": breaker.state(),
      },
    }
  );
}
