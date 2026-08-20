# Live flight sources — authority, quotas, cadence

**This document is the single authority on where aircraft data comes from.** If a
threshold, quota or upstream host changes, change it at the source (file named
below) and update this page in the same commit.

Written 2026-08-20, after a day in which two of the three sources were broken at
once and the third was silently degraded. The history section at the bottom
records what actually happened, because every one of those failures was
invisible from the app.

---

## The three sources

| UI label | Provider id | Upstream | Auth | Quota |
| --- | --- | --- | --- | --- |
| OpenSky | `opensky` | `opensky-network.org/api/states/all` | OAuth2 client credentials | 4 000 credits/day (account tier) |
| adsb.lol | `adsbone` | `api.adsb.lol/v2/point` | none | dynamic, no published number |
| LunaPic ADS-B | `localsdr` | own Raspberry Pi (push) | shared token | none (own hardware) |

The provider id **`adsbone` is historical**. It is persisted in `localStorage`
(`flightProvider`, `liveFlightFeeds`), so renaming it would need a migration for
no benefit. Only the user-facing label tracks the actual operator.

All three are merged into one aircraft list per tick, keyed by canonical ICAO24.
When the Pi sees an aircraft it wins geometry (`mergeLiveFlightListsWithSdrPriority`);
web sources fill metadata gaps.

---

## OpenSky

### Auth: OAuth2 only

OpenSky **retired HTTP Basic auth**. Username/password is not rejected — it is
*ignored*, and the request is served as anonymous. Credentials come from an
**API Client** (account page → API Client), not the web login:

```
OPENSKY_CLIENT_ID=<client id>
OPENSKY_CLIENT_SECRET=<secret, shown once at creation>
```

`getOpenSkyBearerToken()` in [`src/app/api/opensky/states/route.ts`](../src/app/api/opensky/states/route.ts)
posts `grant_type=client_credentials` to the Keycloak endpoint and caches the
token in module scope until 30 s before expiry. **If the token fetch fails the
route continues anonymously** and logs `proceeding as anonymous — OAuth2 token
fetch failed`. Because of that fallback, `X-MoonTransit-OpenSky-Auth: yes` alone
does not prove the token works — check the log line, or the credit count.

### Credits

Charged **per request**, by bounding-box area (≤25 sq° = 1 credit; 25–100 = 2;
100–400 = 3; global = 4). Our observer bbox is ~4.7 sq° → **1 credit per call**.

| Tier | Credits/day |
| --- | --- |
| anonymous (per IP) | 400 |
| registered API client | 4 000 |
| active feeder (≥30 % uptime) | 8 000 |

Every proxy response carries **`X-MoonTransit-OpenSky-Credits`** (see
[`src/lib/server/openSkyCredits.ts`](../src/lib/server/openSkyCredits.ts)) — on a
cache hit it is the reading from the last real upstream call. Below
`OPENSKY_LOW_CREDITS_WARN_BELOW` (200) the server log gets a warning, so the
squeeze is visible before the feed stops.

```bash
curl -sI "https://drusany.com/LunaPic/api/opensky/states?lamin=45.3&lomin=15.3&lamax=46.3&lomax=16.3" | grep -i credits
```

**Diagnosing the anonymous fallback:** issue one authenticated and one
unauthenticated request from the same IP and compare `X-Rate-Limit-Remaining`.
If both decrement the same running counter, the auth is not being honoured — the
two tiers keep separate pools.

---

## adsb.lol

Community open-data network, ADSBExchange v2 shape, no API key. Same path and
payload as the retired hosts (`/v2/point/{lat}/{lon}/{radius}` → `{ ac: [...] }`),
which is why the swap needed no parser change. Terms: non-commercial; data comes
from volunteer feeders. Their repo warns a key may be required later, obtainable
by feeding them.

Upstream list lives in [`adsbLiveUpstreamBases.ts`](../src/lib/flight/adsbone/adsbLiveUpstreamBases.ts).
**If a second entry is ever added, pick an unrelated operator** — the previous
two-entry list (`api.adsb.one` + `api.airplanes.live`) looked like redundancy but
was one service under two hostnames, so both died together.

---

## LunaPic ADS-B (Raspberry Pi)

**Push is the production path.** The Pi POSTs `aircraft.json` to
`/api/localsdr/ingest` every 15 s (`x-sdr-token`), the route writes
`data/sdr-snapshot.json`, and readers treat a snapshot older than 60 s as dead.
Pull from `LOCAL_SDR_URL` is a fallback used in local dev on the same network.
Full rationale in [AGENTS.md](../AGENTS.md).

The pull path is behind a circuit breaker (below). The **push branch is checked
before the breaker**, so a Pi that resumes pushing is served immediately no
matter what the circuit state is.

---

## Poll cadence and the credit budget

[`useMoonTransitMap.ts`](../src/hooks/useMoonTransitMap.ts) runs **two timers**:

| Timer | Interval | Sources |
| --- | --- | --- |
| web | 30 s (`LIVE_AUTO_REFRESH_MS`) | OpenSky, adsb.lol |
| SDR | 10 s (`LOCALSDR_AUTO_REFRESH_MS`) | localsdr only, via `loadFlightsInBounds(bounds, { only: "localsdr" })` |

**Both stop while the tab is hidden** and restart with one immediate refresh when
it becomes visible.

This is a budget, not a preference: at 30 s one visible tab costs ~120 credits/h,
so 4 000 lasts ~33 h of watching. Before the split, a single interval drove every
source and the Pi checkbox silently pulled OpenSky to 10 s — 360 credits/h, i.e.
the whole daily allowance in about an hour.

The SDR-only tick keeps the last web aircraft on the map (SDR-priority merge over
the previous list); their ageing is still bounded by the 32 s retention applied on
the next full tick. An empty response from the Pi must never clear web aircraft —
there is a test for this in
[`moon-transit-store.liveFeeds.test.ts`](../src/stores/moon-transit-store.liveFeeds.test.ts).

---

## Circuit breakers

[`src/lib/server/upstreamCircuitBreaker.ts`](../src/lib/server/upstreamCircuitBreaker.ts),
same in-memory caveat as `rateLimiter` / `ttlBodyCache` (per process; cPanel may
run several).

| Route | Threshold | Open for | Response while open |
| --- | --- | --- | --- |
| `/api/adsbone/point` | 3 consecutive failures | 60 s | `503` + `Retry-After` |
| `/api/localsdr/aircraft` (pull only) | 3 consecutive failures | 30 s | `503` + `Retry-After` |

After the pause **one probe request** decides: success closes the circuit,
failure reopens it. Clients honour `Retry-After` for both 429 and 503.

`/api/adsbone/point` also **propagates the upstream status** instead of flattening
everything to 502: 400/403/404/429/451 pass through, 5xx and network errors stay
502, timeouts return 504, and `X-MoonTransit-Upstream-Status` carries the raw
upstream code.

---

## What the UI shows when a source fails

In the **Flight source** panel ([`FlightSourcePanel.tsx`](../src/components/shell/panels/FlightSourcePanel.tsx)):

- healthy → aircraft count in brackets
- `rate limited` (amber) → `webFeedStatus === "rate-limited"`, plus a note when it is OpenSky
- `unavailable` (rose) → any other web-feed failure
- `offline` (rose) → `localsdrStatus === "unreachable"`

A source still serving its own short-lived client cache during backoff keeps
showing a count and no badge — the user is looking at real data, so flagging it
would be misleading.

---

## When a feed goes quiet — check in this order

1. **The panel badge.** Rate limited vs unavailable vs offline already splits the
   problem three ways.
2. **The proxy route directly**, e.g.
   `curl -sD - -o /dev/null ".../api/adsbone/point?lat=..&lng=..&radiusNm=79.6"`.
   Read `X-MoonTransit-Upstream-Status`, `X-MoonTransit-Circuit`,
   `X-MoonTransit-OpenSky-Credits`.
3. **The upstream itself, with plain curl.** Every failure in the 2026-08-20
   round was upstream policy, not our code — and two of them returned a *200-shaped
   error* or a 403 HTML page rather than anything the app could classify.
4. **The env of the running process**, not the config file:
   `tr '\0' '\n' < /proc/<pid>/environ | cut -d= -f1`. See
   [deployment-cpanel.md](./deployment-cpanel.md) — on cPanel the variables come
   from `SetEnv` in `.htaccess`, not from `.env`.

---

## History (why things are the way they are)

**2026-04-29 — `api.adsb.one` retired.** Its API doc repo
(`airplanes-live/api-archive`) was archived; the host now answers Cloudflare 403
on every path including `/`. No API key ever existed for it.

**Between 2026-07-25 and 2026-08-20 — `api.airplanes.live` closed to unapproved
clients.** Returns 403 with a body asking you to email them with a project
description. Their public API guide still advertised open access on the last
Wayback snapshot (2026-07-25), so the gate was never documented.

These two were **the same operator** — adsb.one is the old hostname of the
service that became Airplanes.live — which is why "two mirrors" gave no real
redundancy.

**2026-08-20 — replaced by `api.adsb.lol`** (PR #25), an unrelated operator with
an identical payload shape.

**Undated, discovered 2026-08-20 — OpenSky stopped honouring Basic auth.** The
app had been running as anonymous (400 credits/IP) with `OPENSKY_API_USER` /
`OPENSKY_API_PASSWORD` set and apparently working. Proof: authenticated and
anonymous requests from one IP decremented a single counter (395 → 394 → 393).
Fixed by switching the route to OAuth2 and configuring
`OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`; the account had an API client all
along, it had simply never been used.

**2026-08-20 — same day, the Pi was offline** (moving location), so with OpenSky
throttled and adsb.one dead the app briefly had one working source out of three.
That is what motivated the badges, the credit header and the cadence split: every
one of these failures was silent.
