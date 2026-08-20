import { NextResponse } from "next/server";

import { checkRateLimit, getClientIp } from "@/lib/server/rateLimiter";
import { createTtlBodyCache } from "@/lib/server/ttlBodyCache";
import {
  createOpenSkyCreditsTracker,
  OPENSKY_LOW_CREDITS_WARN_BELOW,
} from "@/lib/server/openSkyCredits";

const OPENSKY_BASE = "https://opensky-network.org/api/states/all";
/**
 * OpenSky je ugasio Basic Auth (username/password) za REST API; jedini put do
 * autenticiranih (višeg) rate limita je OAuth2 client-credentials preko ovog
 * Keycloak token endpointa. Token se cache-ira u modulu do isteka (uz 30s
 * marže) — u toplom serverless instanceu to štedi poziv na svaki request.
 */
const OPENSKY_TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
/**
 * Cjelokupni proračun (TTFB + `text()`). Na **Vercel Hobby** cijela funkcija ima
 * ~**10 s** strop — env je ograničen na **MAX** ispod. **`preferredRegion` + `vercel.json`
 * `regions: [fra1]`** drže izvršavanje u EU. **`OPENSKY_STATES_EXTENDED=0`** smanjuje odgovor.
 */
const DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS = 9_200;
/** Hobby: ostavi ~0,4–0,8s za ostatak handlira ispod 10s stropa. */
const MAX_UPSTREAM_FETCH_TIMEOUT_MS = 9_600;
const parsedTimeout = Number(process.env.OPENSKY_UPSTREAM_TIMEOUT_MS);
const UPSTREAM_FETCH_TIMEOUT_MS =
  Number.isFinite(parsedTimeout) &&
  parsedTimeout >= 2_000 &&
  parsedTimeout <= MAX_UPSTREAM_FETCH_TIMEOUT_MS
    ? Math.floor(parsedTimeout)
    : DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS;
const CDN_CACHE_CONTROL =
  "s-maxage=15, stale-while-revalidate=30";

/** Odgovara Vercel Hobby (~10s); na Pro/Enterprise možeš povećati ovdje i max env. */
export const maxDuration = 10;
/** Izvodi Node serverless u Frankfurtu (bliže OpenSky EU nego default US). Besplatno. */
export const preferredRegion = "fra1";

/** Koliko dugo isti (grub) bbox dijeli jedan upstream odgovor bez novog poziva. */
const PROXY_CACHE_TTL_MS = 12_000;
const PROXY_CACHE_MAX_KEYS = 40;

const bboxCache = createTtlBodyCache(PROXY_CACHE_TTL_MS, PROXY_CACHE_MAX_KEYS);

/** Zadnje stanje kredita s upstreama — prosljeđuje se i na cache hitovima. */
const credits = createOpenSkyCreditsTracker();

let cachedOpenSkyToken: { value: string; expiresAt: number } | null = null;

async function getOpenSkyBearerToken(
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  const now = Date.now();
  if (cachedOpenSkyToken && cachedOpenSkyToken.expiresAt > now) {
    return cachedOpenSkyToken.value;
  }
  try {
    const res = await fetch(OPENSKY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[MoonTransit OpenSky] OAuth2 token request failed", {
        status: res.status,
        bodySnippet: (await res.text()).slice(0, 240),
      });
      return null;
    }
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      console.error("[MoonTransit OpenSky] OAuth2 token response missing access_token");
      return null;
    }
    const ttlMs = (data.expires_in ?? 1800) * 1000;
    cachedOpenSkyToken = {
      value: data.access_token,
      expiresAt: now + Math.max(ttlMs - 30_000, 5_000),
    };
    return cachedOpenSkyToken.value;
  } catch (err) {
    console.error("[MoonTransit OpenSky] OAuth2 token request error", { err });
    return null;
  }
}

function bboxCacheKey(
  lamin: string,
  lomin: string,
  lamax: string,
  lomax: string,
  extended: boolean
): string {
  const r = (x: string) => Number(x).toFixed(2);
  return `${r(lamin)}|${r(lomin)}|${r(lamax)}|${r(lomax)}|${extended ? "1" : "0"}`;
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
  // Vrijednost je iz zadnjeg **stvarnog** upstream odgovora; na cache hitu je
  // zato malo starija od odgovora, ali i dalje točnija od nikakve informacije.
  const remaining = credits.lastKnown();
  if (remaining != null) {
    h["X-MoonTransit-OpenSky-Credits"] = String(remaining);
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
 * Cijelo čitanje u okviru jednog proračuna (TTFB + JSON tijelo) — inače bi samo
 * `fetch()` bio ograničen, a `text()` zna kasniti.
 */
async function fetchOpenSkyWithinBudget(
  url: string,
  reqHeaders: Record<string, string>,
  budgetMs: number
): Promise<{ r: Response; bodyText: string }> {
  const t0 = Date.now();
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), budgetMs);
  let r: Response;
  try {
    r = await fetch(url, {
      cache: "no-store",
      headers: reqHeaders,
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
  clearTimeout(tid);
  const forBody = Math.max(0, budgetMs - (Date.now() - t0));
  if (forBody < 1) {
    throw new Error("OpenSky: no budget left for response body (slow TTFB)");
  }
  // Na timeout MORA se prekinuti i sam zahtjev: inače `r.text()` ostaje viseti,
  // a undici ne vraća konekciju u pool dok se tijelo ne pročita ili ne uništi
  // (isti mehanizam koji je rušio SDR feed — vidi `discardBody` u server.js).
  let bodyTid: ReturnType<typeof setTimeout> | undefined;
  try {
    const bodyText = await Promise.race([
      r.text(),
      new Promise<never>((_, rej) => {
        bodyTid = setTimeout(() => {
          ac.abort();
          rej(new Error("OpenSky: response body read timeout"));
        }, forBody);
      }),
    ]);
    return { r, bodyText };
  } finally {
    clearTimeout(bodyTid);
  }
}

/**
 * Proxy prema OpenSky (izbjegava CORS; klijent zove samo ovu rutu).
 * `extended=1` (zadano) — polje `category`; isključi s `OPENSKY_STATES_EXTENDED=0` za brži manji odgovor.
 *
 * Kratkotrajna predmemorija po grubom bbox-u smanjuje 429 kada klijent šalje više
 * zahtjeva u kratkom roku (pan, više komponenti, dev Strict Mode).
 */
export async function GET(req: Request) {
  const rl = checkRateLimit(getClientIp(req), 60, 60_000, "opensky/states");
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

  const la1 = Number(lamin);
  const lo1 = Number(lomin);
  const la2 = Number(lamax);
  const lo2 = Number(lomax);
  if (
    !Number.isFinite(la1) || la1 < -90  || la1 > 90  ||
    !Number.isFinite(lo1) || lo1 < -180 || lo1 > 180 ||
    !Number.isFinite(la2) || la2 < -90  || la2 > 90  ||
    !Number.isFinite(lo2) || lo2 < -180 || lo2 > 180 ||
    la1 >= la2 || lo1 >= lo2
  ) {
    return NextResponse.json(
      { error: "Nevaljane bbox koordinate." },
      { status: 400 }
    );
  }

  const clientId = process.env.OPENSKY_CLIENT_ID?.trim();
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET?.trim();
  const withCred = Boolean(clientId && clientSecret);

  const useExtended =
    process.env.OPENSKY_STATES_EXTENDED?.trim() !== "0";

  const cKey = bboxCacheKey(lamin, lomin, lamax, lomax, useExtended);
  const cachedBody = bboxCache.get(cKey);
  if (cachedBody !== null) {
    return new NextResponse(cachedBody, {
      status: 200,
      headers: jsonHeaders(withCred, "hit"),
    });
  }

  const url = `${OPENSKY_BASE}?lamin=${encodeURIComponent(lamin)}&lomin=${encodeURIComponent(lomin)}&lamax=${encodeURIComponent(lamax)}&lomax=${encodeURIComponent(lomax)}${useExtended ? "&extended=1" : ""}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (clientId && clientSecret) {
    const token = await getOpenSkyBearerToken(clientId, clientSecret);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      console.error(
        "[MoonTransit OpenSky] proceeding as anonymous — OAuth2 token fetch failed despite OPENSKY_CLIENT_ID/SECRET being set"
      );
    }
  }

  try {
    const { r, bodyText } = await fetchOpenSkyWithinBudget(
      url,
      headers,
      UPSTREAM_FETCH_TIMEOUT_MS
    );
    const remaining = credits.record(r.headers.get("X-Rate-Limit-Remaining"));
    if (remaining != null && credits.isLow()) {
      console.warn(
        `[MoonTransit OpenSky] low credits: ${remaining} left (warn below ${OPENSKY_LOW_CREDITS_WARN_BELOW}); feed goes 429 when it hits 0`
      );
    }

    if (!r.ok) {
      const likelyAuth = r.status === 401 || r.status === 403;
      const missingCred = !withCred;
      if (likelyAuth && missingCred) {
        console.error(
          "[MoonTransit OpenSky] upstream auth error without OAuth2 credentials — set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET",
          { status: r.status, bodySnippet: bodyText.slice(0, 240) }
        );
      } else if (likelyAuth && withCred) {
        console.error(
          "[MoonTransit OpenSky] upstream rejected OAuth2 token (401/403) — check OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET are valid",
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
                ? "OpenSky rate limit. Wait 1–2 min; avoid multiple dev tabs; proxy caches 30s per map area. Confirm OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET are a valid OAuth2 API client (opensky-network.org account → API Client), not just the web login."
                : "OpenSky anonymous rate limit. Set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET in .env.local (free account → API Client on opensky-network.org), restart dev server."
              : undefined,
        },
        {
          status,
          headers: jsonHeaders(withCred, "none"),
        }
      );
    }

    bboxCache.set(cKey, bodyText);
    return new NextResponse(bodyText, {
      status: 200,
      headers: jsonHeaders(withCred, "miss"),
    });
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error && err.name === "AbortError";
    const isNetwork =
      err instanceof TypeError &&
      typeof err.message === "string" &&
      /fetch|network|Load failed|Failed to fetch/i.test(err.message);
    const isBodyOrBudget =
      err instanceof Error &&
      /OpenSky: (no budget|response body)/.test(err.message);

    if (isAbort) {
      console.error(
        `[MoonTransit OpenSky] upstream timeout or abort (limit ${UPSTREAM_FETCH_TIMEOUT_MS}ms)`,
        {
          timeoutMs: UPSTREAM_FETCH_TIMEOUT_MS,
          withCred,
          hint:
            "Set OPENSKY_STATES_EXTENDED=0 for a smaller/faster upstream response (no ADS-B category). Ensure Vercel deployment uses region fra1 (see vercel.json).",
        }
      );
    } else if (isBodyOrBudget) {
      console.error(
        "[MoonTransit OpenSky] slow TTFB or body read within budget",
        { message: err instanceof Error ? err.message : String(err), withCred }
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
