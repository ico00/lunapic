# Code review analiza — 2026-05-31

Senior-level pregled aplikacije nakon većeg vala promjena (flight-history logging,
push notifikacije, ADS-B providers). Fokus: SOLID, sigurnost API-ja, nenamjerni
propusti, duplikacija / špageti kod. Ovaj dokument bilježi **nalaze** i **odrađene
popravke** (5 zadataka). Sve promjene rađene su **samo u glavnom direktoriju**, ne u
worktreeu.

---

## 1. Ukupna ocjena

Kvalitetan, zreo codebase. Domenska logika čisto izdvojena u `src/lib/domain/` s
kolokiranim testovima, SQL posvuda parametriziran, dosljedna input validacija, samo
1 `any` u cijelom `src/`. Nije špageti. Nalazi ispod su poboljšanja, a ne kritični
dugovi — uz jednu sigurnosnu iznimku (push/send).

**Dobro napravljeno (referenca, ne dirati bez razloga):**
- `src/lib/domain/` — pure funkcije, jedna odgovornost, testovi uz kod.
- Flight provider registry (`src/lib/flight/providers/`) — uredan Strategy/OCP uzorak.
- `useHomeShellOrchestration` — state/orchestration izdvojen iz komponente (SRP).
- SQL 100% parametriziran; `icao24`/`callsign` regex-validirani; numerički parametri clamped.
- `data/`, `.env*` u `.gitignore`; debug endpoint zaključan `ADMIN_SECRET`-om u produkciji.

---

## 2. Sigurnosni nalazi

### 2.1 🔴 `POST /api/push/send` — zaobilazna zaštita broadcast endpointa — **POPRAVLJENO**

**Problem:** Jedina zaštita bila je `if (origin && !ALLOWED_ORIGINS.has(origin))`.
Kako je uvjet ovisio o postojanju `Origin` headera, **izostanak headera (trivijalno
s `curl`) preskočio bi provjeru**. Endpoint je fan-out broadcast (šalje svim
pretplatnicima napadačev `title`/`body`) → vektor za spam/phishing push notifikacije.
Rate limit (10/min/IP) ne pomaže jer svaki poziv pogađa sve uređaje.

**Zašto ne shared secret:** endpoint zove browser (`useCandidateAlerts.ts`), pa bi
svaka tajna u klijentu bila javna. Realne opcije su origin-hardening ili server-side
okidanje.

**Popravak** (`src/app/api/push/send/route.ts`):
- `isSameOriginRequest()` — **traži** valjani `Origin`; ako ga reverse proxy skine
  (Tailscale Funnel), pada na `Referer`; bez ijednog → 403. Zatvara `curl` bypass.
- Sanitizacija payloada: `title` ≤ 80, `body` ≤ 200 znakova, prazan title → 400;
  `tag` validiran uzorkom `^[a-z0-9-]{1,48}$`; `urgent` striktno `=== true`.
- Rate limit snižen 10 → 5 / min / IP (broadcast je skup).

**Procjena prijetnje (kontekst):** osobna foto-aplikacija; napadač bi morao naći URL,
svladati rate limit, forge-ati Origin i imati motiv. Omjer truda i štete nizak —
zato je odabran proporcionalan hardening, ne server-side redizajn.

### 2.2 🟡 Nedostaju CSP i HSTS — **POPRAVLJENO**

Postojali su `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`,
ali ne `Content-Security-Policy` ni `Strict-Transport-Security`.

**Popravak** (`next.config.ts`):
- **HSTS** `max-age=31536000`, **bez** `includeSubDomains`/`preload` namjerno — da ne
  zaključa sibling subdomene na istoj apex domeni (cPanel footgun).
- **CSP** s `connect-src` zaključanim na stvarno korištene origine + `frame-ancestors
  'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `upgrade-insecure-requests`.

**Granica CSP-a (svjesna):** `script-src` mora dopuštati `'unsafe-inline'
'unsafe-eval'` jer to zahtijevaju Next.js hidratacija i Google Maps (Street View) JS
API — bez nonce-middlewarea (velik zahvat) neizbježno. Vrijednost ove policy je u
`connect-src`/`frame`/`object`/`base` lockdownu, ne u zaštiti skripti.

**Vanjski origini potvrđeni u kodu** (za buduće izmjene CSP-a):
- Mapbox GL: `*.mapbox.com` (stilovi/glyphovi/tile-ovi preko fetch/XHR → `connect-src`)
- Google Street View: `maps.googleapis.com`, `maps.gstatic.com`, `*.ggpht.com`, `*.google.com`
- OpenAIP tile-ovi: `*.tiles.openaip.net`
- Weather (direktni klijentski fetch): `api.open-meteo.com`
- ADS-B direktni fallback (`NEXT_PUBLIC_ADSBONE_ALLOW_DIRECT=1`): `api.adsb.one`, `api.airplanes.live`
- Sentry (samo produkcija): `*.sentry.io`
- Sve slike (kiwi logotipi, NASA faze, tile-ovi) → `img-src https:`
- Aircraft index, push, ostali proxyji → same-origin (`'self'`)

> ⚠️ **`NEXT_PUBLIC_SITE_URL` mora biti postavljen na produkcijsku domenu**, inače
> `ALLOWED_ORIGINS` (push/send) sadrži samo localhost i blokira legitimne prod pozive.

### 2.3 🟡 Javni API ključevi (deployment, ne kod)

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`,
`NEXT_PUBLIC_OPENAIP_API_KEY` nužno su na klijentu. Kod ih ne može zaštititi — **moraju**
imati HTTP-referrer/domain restrikciju u svojim konzolama, posebno Google Maps
(naplata po pozivu). Deployment checklista, nije rađeno u kodu.

---

## 3. Skalabilnost — flight-log baza

### 3.1 Retention `positions` tablice — **POPRAVLJENO**

`positions`/`aircraft` rasle su neograničeno (poller upisuje svakih 15s zauvijek), a
read-path API-ja čita **cijeli** DB file u memoriju na svaki zahtjev → veličina baze
izravno usporava upite.

**Popravak** (`server.js`):
- `RETENTION_DAYS` iz `FLIGHT_LOG_RETENTION_DAYS` (default 90, min 1).
- `pruneOldData()` — `DELETE … WHERE logged_at/last_seen < cutoff` + `VACUUM` + save;
  prvi prune ~1 min nakon starta, zatim svakih 6h.
- Dokumentirano u `.env.local.example`; query prozori API ruta (do 365d) efektivno su
  ograničeni ovom vrijednošću.
- **Posljedica:** veličina baze sad je omeđena, pa O(filesize) read-path trošak više
  ne raste neograničeno. Potpuni fix (perzistentna read konekcija / `better-sqlite3`)
  ostaje veći zahvat, izvan opsega.

> Napomena: poller (a time i retention) radi **samo** pod `npm run start:cpanel` /
> `server.js`, ne pod `next dev`.

---

## 4. DRY / duplikacija — **POPRAVLJENO**

| Helper | Prije | Sada |
|---|---|---|
| `migrateDb` schema | duplicirana: server.js inline `CREATE TABLE` + `flightLogDb.migrateDb` (mrtav kod) | `flightLogSchema.cjs` (root) — jedini izvor; `migrateDb` obrisan |
| `readSubs`/`writeSubs` | push/send + push/subscribe | `src/lib/server/pushSubsStore.ts` |
| TTL body cache | opensky + adsbone (opensky imao i redundantan dupli-prune) | `src/lib/server/ttlBodyCache.ts` — `createTtlBodyCache(ttl, maxKeys)` |
| `parseSdrUrl` | server.js (CJS) + localsdr (TS) | `sdrUrl.cjs` (root) |

Neto: ~150 redaka duplikata uklonjeno, 4 nova fokusirana modula. Opensky cache usput
dobio jedinstvenu, ispravnu FIFO evikciju.

### Ključni obrazac: CJS/ESM dijeljeni kod

`server.js` je plain Node CommonJS i **ne može** importati TypeScript. Za bilo koji
kod koji se dijeli sa server.js:

1. Napiši ga kao plain **`.cjs` u rootu** (uzor: `cpanelBasePath.cjs`, sada i
   `flightLogSchema.cjs`, `sdrUrl.cjs`).
2. server.js ga učita preko `requireFromRoot(path.resolve(process.cwd(), "x.cjs"))`.
3. TS rute ga učitaju **runtime require-om**:
   ```ts
   // eslint-disable-next-line @typescript-eslint/no-require-imports
   const { fn } = require(path.join(process.cwd(), "x.cjs")) as { fn: ... };
   ```
   Argument je ne-literal → bundler ga ne pokušava statički razriješiti (bundler-safe).
   Isti idiom već postoji za `sql.js` u `flightLogDb.ts` / debug ruti.

---

## 5. SOLID / arhitektura — preostalo (NIJE rađeno)

**`src/components/shell/HomePageClient.tsx` (1408 LOC):** 11 komponenti u jednoj
datoteci (`BrandPill`, `CommandBar`, `TopRightCluster`, `FloatingRail`, `TimeRibbon`,
`GreenZoneAlert`, `MobileDock`, `MobileSheet`, `MoreToolsGrid`…) + `renderPanel`
callback ~137 redaka. Nije špageti (komponente su male i fokusirane), ali je
organizacijski najveći refactor-kandidat — razbijanje na zasebne datoteke spustilo bi
file na ~400 LOC. Odgođeno kao čisti mehanički refactor uz najveći rizik regresija.

---

## 6. Verifikacija

- `tsc --noEmit` čist; `eslint` čist na svim diranim datotekama.
- `node --check server.js` OK; `flightLogSchema.cjs` / `sdrUrl.cjs` funkcionalno
  smoke-testirani; prune + VACUUM verificirani pod sql.js.
- `vitest run`: 107 prolazi. **3 pada (`screening.test.ts`, `flightAltitudeColor.test.ts`)
  su pre-postojeća** i neovisna o ovom radu — ti fajlovi i njihov SUT nisu dirani.

**Zahtijeva restart servera (mijenja config / server runtime):**
- Postaviti `NEXT_PUBLIC_SITE_URL` na prod domenu (inače push 403 u produkciji).
- Učitati app s DevTools konzolom → potvrditi mape / Street View / weather (CSP violationi se loguju).
- Potvrditi da localsdr ruta odgovara (sdrUrl.cjs runtime require).
