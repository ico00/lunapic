# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
where version bumps are made for releases (currently `0.x`).

## [2026-08-16] — Moon disk rendered locally (NASA SVS host became unreachable)

See also: [architecture.md → Viewfinder preview](architecture.md), [ui-generator-technical-spec.md §8.5](ui-generator-technical-spec.md).

### Fixed

- **Viewfinder showed no moon at all.** `svs.gsfc.nasa.gov` stopped answering — DNS still resolves (`169.154.143.10`), but TCP 443 and 80 both hang locally and refuse from other networks, while `www.nasa.gov` / `science.nasa.gov` stay up. The domain has not moved; it is an outage on the SVS host. CSP was **not** involved (`img-src 'self' data: blob: https:` allows any HTTPS image).
- **The static fallback never appeared either.** `ViewfinderPreview` swapped to `public/moon-textures/nasa-full-moon.jpg` only on `img.onerror`. That event fires promptly on a refused connection but not on a *hung* one — the browser sits on its own connect timeout for tens of seconds first, and the frame index changes hourly, so each new hour restarted the hang. The disk stayed black in the meantime.

### Changed

- **New `src/lib/domain/astro/moonPhaseGeometry.ts`** — the phase is now geometry, not a downloaded image:
  - `getMoonPhaseGeometry(at)` → `illuminationFraction` (`Astronomy.Illumination`) + `brightLimbAngleDeg`, the position angle of the bright limb from celestial north through east (Meeus ch. 48). Computed **geocentrically** on purpose: topocentric parallax tilts the limb angle by up to ~1° without telling the disk anything it can show.
  - `moonPhasePathD()` → SVG path of the sunlit region: the `+x` half of the limb circle plus a terminator half-ellipse of semi-axis `r·|1 − 2k|`. The ellipse bulges toward the lit limb while crescent, away once gibbous, and degenerates to the straight quarter-moon edge at `k = 0.5` (SVG renders a zero-radius arc as a line, so no special case).
  - `moonPhaseRotationDeg(χ, parallactic)` → rotation into the camera frame.
- **`ViewfinderPreview` no longer hits the network for the moon.** The `<image>` always points at the bundled full-moon texture; an SVG `<mask>` carries the phase. The `Image()` preload effect, the `nasaLoadFailedForUrl` state, and the whole fallback branch are gone — there is nothing left to fail.
- **Removed `src/lib/domain/astro/nasaMoonPhaseFrame.ts`** and its test; the export in `src/lib/domain/index.ts` now points at `moonPhaseGeometry`. This also drops the **2023–2026 catalog-year bound** — simulated dates outside that range used to be silently snapped to the nearest catalog year, and now render their real phase.
- **The disk is now parallactic-corrected.** The SVS stills were fixed *north up*, so the terminator sat at the wrong angle in a frame whose aircraft silhouette was already corrected (`correctedHeadingDeg` in [ViewfinderPreview.tsx](../src/components/field/ViewfinderPreview.tsx)). Both now share one frame.
- **Night side is dimmed, not cut** — `UNLIT_DISK_VISIBILITY = 0.15`. A fully transparent night side read as a hole punched in the frame rather than as a disk. The mask uses **white with `fillOpacity`** rather than a grey hex: masks are luminance-based and implementations disagree on sRGB vs linearRGB, but white has luminance 1 in both, so the value is stable across browsers. See spec §8.5 for the upper bound (the yellow aircraft outline draws over the disk).

### Known omissions vs. the SVS frames

No **libration** (the disk never wobbles) and no earthshine — the 15 % night side is a legibility aid, not a physical model. Both are invisible at the size the disk is drawn.

### Verification

10 new unit tests in `moonPhaseGeometry.test.ts`; full suite 146/146 and `tsc --noEmit` clean. Angles checked against real dates: first quarter χ ≈ 284° (west), last quarter χ ≈ 82° (east), full moon `k` = 1.000. For a 45.8°N observer at lunar meridian transit the lit direction lands at `x = +0.98` — right, as the northern hemisphere sees it. The component itself was rendered via `renderToStaticMarkup` and inspected in the browser across a full lunation. **Not** verified through the live app UI: `PhotographerToolsPanel` only mounts the viewfinder when `photoPack.timeToAlignmentSec != null`, and no live flight had a predicted azimuth alignment at the time.

---

## [2026-07-22] — Shared transit computation (fix desktop CPU/fan overload)

See also: [architecture.md → Shared transit computation (dedup)](architecture.md#shared-transit-computation-dedup), [optimization-and-refactoring.md §9](optimization-and-refactoring.md).

### Fixed

- **Duplicated moon/transit computation across 4-6 components, each on its own tick.** Reported symptom: the app pegged a desktop CPU/GPU hard enough to spin fans and force a reset — heavier than typical render software. Root cause was not a single runaway loop but the same expensive work running independently in parallel: `useMoonStateComputed` (`AstroService.getMoonState`) ran separately in `MapContainer`, `FieldOverlaysSection`, `CompassAimPanel`, and `useHomeShellOrchestration`, each with its **own** `useWallNowMs` (250 ms) rAF tick and its own `useMemo`; `useTransitCandidates` (full screening + `photographerPack` per candidate over the entire `flights` array) ran separately in `useHomeShellOrchestration` **and** `ArSkyCameraPanel`; `useActiveTransits` ran its own full pass in `useHomeShellOrchestration`. None of this was gated on whether the consuming panel was visible — `useHomeShellOrchestration` and `MapContainer` are both always mounted — so the duplicated cost ran continuously, on top of Mapbox's own WebGL re-render load from the map's 80 ms flight-extrapolation tick.

### Changed

- **New derived store `useTransitComputedStore`** (`src/stores/transit-computed-store.ts`) holding `{ moon, candidates, activeTransits }` — a computed cache, not owned input state.
- **New writer hook `useSharedTransitComputation`** (`src/hooks/useSharedTransitComputation.ts`) — the single `useWallNowMs(250)` tick + `useMemo` + `useLayoutEffect` that computes all three and writes them into the store. Mounted exactly once, from `useHomeShellOrchestration`.
- **`useMoonStateComputed`, `useTransitCandidates`, `useActiveTransits`** (`src/hooks/useTransitCandidates.ts`, `useActiveTransits.ts`) rewritten as thin `useTransitComputedStore` selectors — same names and call sites in `MapContainer` / `FieldOverlaysSection` / `CompassAimPanel` / `ArSkyCameraPanel` unchanged, so no consumer needed edits beyond the one below.
- **`useActiveTransits()` dropped its `toleranceDeg` parameter.** The sole caller (`useHomeShellOrchestration`) always passed the default (`DEFAULT_ACTIVE_TRANSIT_TOL_DEG` = 0.5°); the unused flexibility was removed instead of threaded through the shared store. If a future caller needs a different tolerance, extend the store or compute that one instance separately rather than reintroducing per-component duplication.
- Pipeline thresholds and tick rate (250 ms) are unchanged — this is purely a where-is-it-computed change. Verified: `tsc --noEmit`, `eslint`, full Vitest suite (141/141) all clean; manually confirmed in-browser that Moon (nowcast), Transit candidates, and the map's moon-path overlay still show correct, consistent values after the refactor.

---

## [2026-07-22] — Viewfinder off-frame ghost silhouette + smjer putanje

Vidi i: [architecture.md → Viewfinder preview](architecture.md)

### Added

- **Viewfinder — off-frame ghost silhouette.** Dok je odabrani avion izvan kadra
  vieweera, uz postojeću rubnu strelicu i kutnu separaciju sad se prikazuje i
  simulirana silueta na disku Mjeseca: **veličina** je izvedena iz predviđene
  udaljenosti pri azimutalnom poravnanju (`photoPack.futureSlantMeters`,
  prosljeđen kao `futureSlantRangeMeters`), s fallbackom na trenutnu udaljenost
  kad predviđanje još ne postoji (npr. prije nego što je poravnanje uopće
  dosežno). Bez toga bi avion koji je stvarno daleko izgledao kao tanka nit,
  iako će pri poravnanju biti mnogo bliže i veći. Silueta se crta kao **žuti
  obris** (`ViewfinderAircraftSilhouette` sad ima `variant="solid" | "outline"`),
  ne puna tamna ispuna — inače se stapala s tamnom stranom Mjeseca i djelovala
  kao nepovezan drugi objekt (uočeno u testiranju nakon uklanjanja "SIM" oznake).

### Fixed

- **Viewfinder — smjer putanje i strelica pokazivali su nekonzistentne strane.**
  Dvije uzastopne greške u istoj komponenti:
  1. Prva verzija smjera (i za off-frame ghost i za in-frame trajectory/rotaciju
     siluete) izvodila je smjer iz **compass headinga** projiciranog kao karta
     (sjever gore, istok desno) — pogled prema nebu je horizontalno **zrcalo**
     te projekcije (gledajući na jug, avion koji leti na istok ide promatraču
     ulijevo, ne udesno), pa je putanja ulazila s pogrešne strane diska.
  2. Popravak je prebacio smjer na alt-az gap prostor (vektor od trenutne
     pozicije prema **predviđenoj** točki poravnanja, `elevationGapAtAlignmentDeg`),
     što je matematički na istoj osi kao rubna strelica **samo** kad je
     `azimuthGapDeg × elevationGapAtAlignmentDeg = 0` — u općem slučaju se osi
     razilaze, pa su strelica (gdje je avion sada) i putanja/rotacija (kuda ide)
     djelovale nekonzistentno (potvrđeno na stvarnom letu, ~4.5° gap).
  Konačno rješenje: smjer se izvodi **isključivo** iz trenutnog gap vektora
  (`azimuthGapDeg`, `elevationGapDeg`), negiranog — po konstrukciji uvijek
  točno suprotan rubnoj strelici (strelica: centar→avion; putanja: avion→centar),
  pa se osi garantirano poklapaju neovisno o predviđanju. `elevationGapAtAlignmentDeg`
  prop je uklonjen iz `ViewfinderPreview` jer više nije korišten.

## [2026-07-21] — node-sqlite3-wasm migracija, route lines po prolazu, deploy rsync popravci

Vidi i: [architecture.md → Storage: node-sqlite3-wasm](architecture.md) · [deployment-cpanel.md → Standardna deploy procedura + rsync pravila](deployment-cpanel.md)

### Changed

- **Flight-log baza: sql.js → node-sqlite3-wasm (file-based SQLite).** sql.js drži cijelu
  bazu u WASM memoriji — svako čitanje je ponovno parsiralo cijelu datoteku, a writer ju je
  svakih 30 s cijelu exportao i prepisivao; oba troška rasla su s veličinom baze, što je u
  sukobu s ciljem da **povijest raste neograničeno** (više podataka = bolje planiranje).
  Novi driver ima pravi VFS nad Node `fs`: čitanja povlače samo stranice koje upit treba
  (trajna read-only konekcija, reopen po inode promjeni), writer commita **jednu transakciju
  po poll ticku** — trajno na COMMIT-u, bez periodičkog flusha i bez 30-sekundnog prozora
  gubitka kod pada procesa. Bez WAL-a (WASM ograničenje) → `busy_timeout` + retry na read
  pathu; `data/flight-log.db-journal` uz bazu je normalan. I dalje čisti WASM: nema nativne
  kompilacije (mac→linux rsync radi), neovisno o verziji Nodea na hostu (cPanel max = 20,
  pa ugrađeni `node:sqlite` iz Node 22.5+ nije bio opcija). Provjereno: identični API
  odgovori kao sql.js na istoj bazi, integritet nakon prune/VACUUM/reopen, čitanje i upis
  **iza 4 GB granice** datoteke, 141/141 testova. Postojeća baza se otvara bez migracije.
- **`/api/flight-log/routes` — jedna linija po *prolazu*, ne po callsignu.** Callsign koji
  leti svaki dan bio je jedna polilinija koja cik-cak spaja prolaze različitih dana — ravne
  "zrake" preko pola karte (zvijezda nad promatračem). Prolaz se sad reže na promjeni
  callsigna, vremenskoj rupi > 20 min (isto pravilo kao `getCallsignSessions`) ili
  prostornom skoku > 25 km (izlazak iz dosega prijemnika; susjedni fixevi su p50 3.4 km,
  p99 < 16 km). Default prozor 30 → **7 dana**, uzorkovanje 500 → 150 točaka po prolazu,
  novi `maxRoutes` cap (2000 najnovijih prolaza).
- **UI: "Route lines (7 days)" / "Density heatmap (7 days)"** — oba flight-history togglea
  prikazuju prozor iz zajedničke konstante `FLIGHT_HISTORY_DAYS` (`useFlightHistoryLayers`),
  koju koriste i fetchevi — label ne može divergirati od podataka.

### Fixed

- **Deploy rsync footguni (2×, ista obitelj kao `/data/` iz 2026-06-01).**
  (1) Nesidreni `--exclude='node_modules/'` gutao je i `.next/node_modules/` — symlink
  aliase koje Next build generira za `serverExternalPackages` pakete
  (`node-sqlite3-wasm-<hash>` → pravi paket); bez njih produkcija pada s
  `Failed to load external module <pkg>-<hash>`. (2) Sidreni `/node_modules/` sa završnom
  kosom matcha samo direktorije — a na serveru je `node_modules` **cPanel symlink** u
  nodevenv, pa ga `--delete` obrisao (app bez ijednog paketa do ručnog `npm install`).
  Konačno pravilo: `--exclude='/node_modules'` (sidreno, bez završne kose). Sva tri
  pravila dokumentirana u [deployment-cpanel.md](deployment-cpanel.md) i u samoj skripti.
- **`/api/flight-log/debug`** migriran na novi driver + eksplicitno provjerava da je
  `node-sqlite3-wasm.wasm` preživio deploy (`wasmExists`).

### Perf

- **Memoizirani JSON odgovori** za `routes` / `heatmap` / `stats` / `aircraft-list`,
  keyani na `dbVersionKey()` (mtime+size baze) + parametre — burst zahtjeva unutar jednog
  write ticka računa jednom. (Ključni dobitak: otvaranje flight-log panela više ne blokira
  proces — GROUP BY preko cijele tablice išao je na svaki zahtjev, ostali API pozivi bi
  stali, pozicije aviona ostarjele i stale-hide filter ih skidao s karte.)

### Ops / pouke

- **`FLIGHT_LOG_RETENTION_DAYS` NE koristiti.** Retention (30 d) je danas kratko bio
  postavljen na produkciji kao "perf popravak" i mogao je obrisati ~3 tjedna povijesti;
  uklonjen prije štete (baza 288 547 pozicija, lipanj netaknut). **Velika baza je cilj**,
  ne problem — perf se rješava arhitekturom (gornja migracija), nikad brisanjem podataka.
  Env varijabla ostaje samo kao opt-in sigurnosni ventil s sanity-guardom.
- **`chmod 444` recovery trik iz sql.js ere više ne vrijedi** — writer ne presnimava bazu
  iz memorije; recovery je sad Stop → restore → provjera → Start
  (vidi [deployment-cpanel.md](deployment-cpanel.md)).
- Klijentski simptomi "sve je sporo + slojevi se ne prebacuju + VFR ne učitava" na jednom
  stroju, a nigdje drugdje = **degradirani WebGL kontekst dugoživućeg taba** — restart
  preglednika/stroja prije kopanja po kodu.

## [2026-06-02] — Server-side transit alerts (pozadinski Web Push)

Vidi i: [architecture.md → Server-side transit scan](architecture.md#server-side-transit-scan-background-push) · [deployment-cpanel.md → Transit alerti / Web Push](deployment-cpanel.md)

### Added

- **Server-side detekcija tranzita → push neovisan o otvorenom tabu.** Alerti su prije
  ovisili o foreground tabu (kad se ekran ugasi, JS se zamrzne → push se nikad ne pošalje).
  Sada `server.js` poller na svakom ticku šalje pun snapshot letova internoj ruti
  **`/api/transit/scan`**, koja računa kandidate **po pretplati** (svaka push subscription
  nosi svoju `observer` lokaciju + `camera`) i šalje Web Push izravno. Radi i kad je ekran
  ugašen / app u pozadini.
- **Čiste funkcije `computeTransitCandidates` / `computeActiveTransits`** (`src/lib/domain/transit/`)
  kao jedini izvor pragova pipelinea — dijele ih client hookovi (`useTransitCandidates` /
  `useActiveTransits`, sad tanki wrapperi) i scan ruta. + unit testovi.
- **`src/lib/server/webPush.ts`** — shared VAPID config + 410/404 expiry cleanup; koriste ga
  i `/api/transit/scan` i `/api/push/send` (DRY).
- **Pretplata nosi `observer` + `camera`** (`pushSubsStore`, subscribe route, `usePushRegistration`
  s debounced re-upsertom na promjenu lokacije/kamere; toggle OFF → `DELETE`).

### Changed

- **Client više ne šalje push.** Uklonjena `document.hidden → /api/push/send` grana iz
  `useCandidateAlerts` — server je jedini vlasnik notifikacija (nema duplih alerta). Client
  radi samo in-app audio + toast dok je tab vidljiv.
- **`server.js` poller** skuplja pun snapshot letova (prije `MIN_MOVE_M` filtera) i okida
  `triggerTransitScan`. Pod **Phusion Passengerom** `server.listen()` ne veže TCP port, pa
  trigger gađa **javni URL** (`NEXT_PUBLIC_SITE_URL`, override `SCAN_TRIGGER_URL`); na
  `127.0.0.1:PORT` pada samo u lokalnom dev-u.
- **`public/sw.js`** — jača/duža vibracija (Android) + `renotify`. (iOS ignorira `vibrate`/custom
  zvuk — sistemski.)

### Ops / env

- Nove runtime env varijable na cPanelu: **`VAPID_PRIVATE_KEY`**, **`VAPID_SUBJECT`**,
  **`NEXT_PUBLIC_SITE_URL`** (s basePathom), **`INTERNAL_SCAN_TOKEN`** (`openssl rand -hex 32`).
  `server.js` VAPID gate provjerava samo runtime tajne — plain Node ne inlinea `NEXT_PUBLIC_*`.
  Detalji u [deployment-cpanel.md](deployment-cpanel.md).

## [2026-06-01] — Senior code review, flight-log data-loss incident & git baseline

Vidi i: [code review](code-review-analiza-260531.md) · [incident post-mortem](incident-flightlog-dataloss-2026-06-01.md)

### Fixed

- **🔴 Flight-log data-loss incident — `data/` brisan deployom + nezaustavljiv app proces.**
  Produkcijski `data/flight-log.db` (52 549 zapisa) se opetovano resetirao na 32 KB. Dva uzroka:
  (1) **`scripts/deploy-server.sh` — `rsync --delete` bez `--exclude='data/'`** je brisao
  bazu pri svakom deployu (nema je u lokalnom izvoru); (2) **`server.js` SIGTERM handler bez
  `process.exit()`** — app se nije gasio na cPanel Stop/restart, stari proces s praznom
  bazom u memoriji je `saveDb`-om svakih 30s presnimavao file. Oba popravljena; baza vraćena
  iz JetBackupa. Puni post-mortem + recovery runbook u zasebnim dokumentima.
- **`server.js` — `SIGTERM`/`SIGINT` sad pozivaju `process.exit(0)`** nakon `saveDb()`.
  Bez toga je app bio praktički nezaustavljiv (signal "progutan").
- **`scripts/deploy-server.sh` — `--exclude='data/'`** dodan u rsync opcije. Deploy više ne
  dira runtime stanje (`flight-log.db`, `push-subscriptions.json`).
- **`/api/flight-log/debug` — asm.js varijanta sql.js** umjesto WASM (cPanel stripa `.wasm`,
  pa je debug endpoint javljao lažni `sql-wasm.wasm` ENOENT iako prava baza radi).

### Security

- **`POST /api/push/send` hardening** — zatvoren Origin bypass (`isSameOriginRequest`: traži
  valjani `Origin`, fallback na `Referer`; prije je izostanak headera prolazio). Payload
  sanitiziran (title ≤ 80, body ≤ 200 znakova, `tag` regex), rate limit 10 → 5 / min.
- **`next.config.ts` — Content-Security-Policy + HSTS.** CSP zaključava `connect-src` na
  poznate origine (Mapbox, Google Street View, OpenAIP, open-meteo, Sentry, direktni ADS-B)
  + `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `upgrade-insecure-requests`.
  `script-src` ostaje permisivan (`unsafe-inline/eval`) jer to traže Next hidratacija i Google
  Maps. HSTS `max-age=31536000` bez `includeSubDomains` (cPanel sibling-subdomena footgun).
  > Zahtijeva `NEXT_PUBLIC_SITE_URL` na prod domenu — inače push 403 (ALLOWED_ORIGINS = localhost).

### Changed

- **Flight-log retention — OPT-IN, default ISKLJUČEN.** `FLIGHT_LOG_RETENTION_DAYS` mora biti
  eksplicitno postavljen da poller briše stare zapise; bez njega ništa se ne briše. Dodan
  sanity-guard u `pruneOldData` (prekida prune koji bi obrisao sve redove — zaštita od
  scale/units pogreške). Prvotni default (90 dana, uvijek aktivan) bio je footgun.
- **`server.js` — `loadEnvConfig` na vrhu** (`@next/env`) tako da se `LOCAL_SDR_URL` čita
  nakon učitavanja `.env.local` (Next inače učita env tek u `app.prepare()`).

### Refactored (DRY)

- **`src/lib/server/pushSubsStore.ts`** — `readSubs`/`writeSubs` izvučeni iz push/send + push/subscribe.
- **`src/lib/server/ttlBodyCache.ts`** — `createTtlBodyCache` dijele opensky + adsbone proxy rute.
- **`flightLogSchema.cjs`** (root) — jedini izvor SQLite sheme; mrtvi `migrateDb` uklonjen iz
  `flightLogDb.ts`. **`sdrUrl.cjs`** (root) — `parseSdrUrl` dijele `server.js` + localsdr ruta.
  Obrazac: kod dijeljen sa CJS `server.js`-om ide u plain `.cjs` u rootu (kao `cpanelBasePath.cjs`).

### Tests

- **Ažurirani zastarjeli testovi** (`screening.test.ts`, `flightAltitudeColor.test.ts`) —
  očekivanja nakon promjena u domeni: screening helper bez speed/track (approach filter),
  altitude legend stopovi poravnati s 5/15/25/35/45k ft bandovima. Svih 110 prolazi.

### Chore

- **Git baseline** — repozitorij doveden u sklad s deployanim radnim direktorijem (catch-up
  commit prethodnog necommitanog rada). `.claude/` dodan u `.gitignore` i prestao se pratiti.

## [2026-05-26] — Animation Performance & Cross-Device Countdown Sync

### Changed

- **`useExtrapolatedFlightsForMap` — rAF tick replaces `setInterval(400 ms)`** — The flight-extrapolation hook that drives aircraft positions on the map now drives itself with `requestAnimationFrame` (throttled to one update per `MIN_TICK_MS = 80 ms`, ≈ 12 fps) instead of a bare `setInterval(400)`. Under the old timer, `setInterval` callbacks fire late when the main thread is busy, producing 400–2 000 ms gaps between map updates; the combined result was the freeze-then-sudden-jump visual artefact. `requestAnimationFrame` fires before each paint so the browser coordinates the animation — no more inter-frame drift on slow devices or during long renders. `lastTickRef` tracks the last rAF timestamp; if less than `MIN_TICK_MS` has elapsed the tick is skipped, preventing oversaturation of Mapbox with redundant `setData` calls.

- **`useMapGeoJsonSync` — GeoJSON throttle reduced from 300 ms to 80 ms** — `FLIGHTS_GEOJSON_MIN_INTERVAL_MS` was 300 ms (introduced as an iOS/Safari compatibility measure), which capped the effective map-animation rate at ≈ 3.3 fps regardless of how fast the extrapolation hook ran. Aligned to 80 ms so Mapbox `setData` keeps pace with the new rAF tick and renders every extrapolated position without additional latency.

- **`AstroService.getMoonState` — 10-second LRU cache** — `getMoonStateCached` wraps every `getMoonState` call with a round-to-nearest-10 000 ms bucket key `(epochMs|lat|lng|elev)`. Moon position changes < 0.1 arcsecond per 10 s — imperceptible on screen — so the same VSOP87 result is reused for all calls within a bucket. Cache limit: 60 entries (evicts oldest-inserted first via `Map` insertion order). Before this change, `usePhotographerTools` with `now` in its deps called `getMoonState` twice per 100 ms tick = **20 heavy astronomy-engine calls per second**, blocking the main thread for 200–500 ms on mobile. After: ≈ 0.2 ms per tick (cache hit path).

- **`usePhotographerTools` — wall clock `now` restored as dep; pack runs every 100 ms** — The pack `useMemo` was previously restructured to remove `now` from its dependency array (to reduce `getMoonState` cost), splitting the result into a "heavy" pack computed at `refEpoch` frequency and a "live" countdown derived separately. This introduced a cross-device desync: `refEpoch` is updated by `tickLiveTime()` which fires every 30 s independently on each device (no network sync), so two devices could see countdowns differing by up to 30 s for the same aircraft. Reverted: `now` (the 100 ms `Date.now()` wall clock, which is inherently synchronized across devices) is back in the `useMemo` deps, and `extrapolateFlightForDisplay(raw, now, latencySkewMs)` is called directly in the pack computation. The `getMoonState` cache absorbs the cost, keeping each 100 ms tick at ≈ 0.2 ms instead of the original ≈ 10 ms.

- **`geometryEnginePhotographer` — moon azimuth rate delta raised from 2 s to 20 s** — `photographerPack` computes the moon's azimuth angular rate by calling `getMoonState(at)` and `getMoonState(at + Δt)` and dividing the difference by Δt. With the 10 s LRU cache a `Δt = 2 s` forward step is pathological in two ways: if `at` and `at + 2 s` fall in the **same** 10-second bucket they round to the same key → `dMoon = 0°` → `moAzRateDegS = 0`, and `timeToAlignmentSec` becomes an unreliable large value. If they fall in **adjacent** buckets (i.e. `at` is within 2 s of a bucket boundary) → `dMoon = moon's full 10 s of travel / 2 s` → `moAzRateDegS = 5× actual`. A 5× error in the moon rate changes `timeToAlignmentSec` by several seconds; because two devices' `refEpoch` values can land on opposite sides of the bucket boundary, countdowns differed by 5–15 s between mobile and desktop even after restoring `now` to the deps. Fix: `Δt = 20 000 ms` (exactly 2× the bucket size). `bucket(at + 20 s) = bucket(at) + 20 000 ms` is guaranteed regardless of where `at` falls inside the bucket — different buckets, correct 20 s moon travel, correct rate. Divisor updated from `/ 2` to `/ 20`.

- **`useMoonTransitMap` — local SDR auto-refresh reduced from 30 s to 10 s** — When `localsdrActive` is true (the LunaPic Raspberry Pi ADS-B receiver is selected as a live feed alongside an OpenSky-family provider), the map polling interval switches from `LIVE_AUTO_REFRESH_MS = 30 000 ms` to the new `LOCALSDR_AUTO_REFRESH_MS = 10 000 ms`. The Pi's readsb updates positions every ~1 s; the server-side cache on `/api/localsdr/aircraft` holds responses for 10 s. At 30 s polling an aircraft flying at 250 m/s would jump ~7.5 km between refreshes; at 10 s the jump is ≤ 2.5 km, keeping position discontinuities visually tolerable. `localsdrActive` is also added to the polling `useEffect`'s dependency array so the interval restarts at the correct period when the localsdr feed is toggled on or off.

---

## [2026-05-25] — API Security Hardening + Pi nginx Basic Auth

### Added

- **Security — rate limiting on all remaining API routes** — `rejectIfRateLimited` convenience helper added to `src/lib/server/rateLimiter.ts` (wraps `checkRateLimit` + `getClientIp`, returns `NextResponse 429` or `null`). Applied to every previously unprotected route:
  - `/api/localsdr/aircraft` — 20 req/60 s per IP
  - `/api/flight-log/heatmap`, `/api/flight-log/routes`, `/api/flight-log/callsign-analysis` — 20 req/60 s (expensive DB queries)
  - `/api/flight-log/stats`, `/api/flight-log/aircraft-list`, `/api/flight-log/aircraft/[icao24]`, `/api/flight-log/track/[icao24]` — 30 req/60 s
  - `/api/push/send` — 10 req/60 s
  - `/api/push/subscribe` POST + DELETE — 10 req/60 s
  Previously only `/api/opensky/states` and `/api/adsbone/point` had rate limiting.

- **Security — `ADMIN_SECRET` guard on `/api/flight-log/debug`** — The debug endpoint exposed `process.cwd()`, Node.js version, DB file path, DB schema, and query results to anyone who discovered the URL. It now requires `Authorization: Bearer <token>` (or `?secret=<token>`) matching the `ADMIN_SECRET` env var. If `ADMIN_SECRET` is set, the check is always enforced. If `ADMIN_SECRET` is not set and `NODE_ENV === "production"`, the endpoint returns 403 (disabled). In development without a secret, it remains open for convenience.

- **Security — 10 s in-memory cache on `/api/localsdr/aircraft`** — Protects the Raspberry Pi from multiple concurrent clients or rapid re-requests. All requests within a 10 s window are served from the cached response; the Pi receives at most one real HTTP request per 10 s regardless of how many browser clients are open.

- **Infrastructure — nginx basic auth in front of tar1090 on Raspberry Pi** — tar1090 / lighttpd moved from port 80 to port 8080 (internal only). nginx installed on port 80 with HTTP basic auth (`/etc/nginx/.htpasswd`) proxying to `localhost:8080`. Tailscale Funnel continues to expose port 80 publicly. Direct access to `https://lunapic.tailcdc789.ts.net/tar1090/...` without credentials now returns 401.

### Fixed

- **`/api/localsdr/aircraft` — credentials in URL rejected by Fetch API** — Node.js / undici `fetch()` throws `TypeError: Request cannot be constructed from a URL that includes credentials` when `LOCAL_SDR_URL` contains `user:pass@host`. The route now uses `parseSdrUrl()` to extract username/password from the URL, strips them from the URL object, and sends an `Authorization: Basic <base64>` header instead. `LOCAL_SDR_URL` in `.env.local` and cPanel environment variables can now safely include credentials (`https://user:pass@host/path`).

---

## [2026-05-25] — Alert Logic + Transit Candidate Screening Consistency

### Fixed

- **`useCandidateAlerts` — alerts now fire only for disk-transit candidates** — Previously the hook fired audio + toast alerts for every item in `candidatesDisplay`, including "In frame" planes that are merely within the camera FOV but are not predicted to cross the moon disc. The candidates loop now iterates only `candidates.filter(c => c.willTransit)`. Additionally, `currentCandidateIds` (used to track "already alerted" flights) tracks only `willTransit: true` IDs, so a flight that first appears as `willTransit: false` and later upgrades to `willTransit: true` (trajectory refined) correctly fires an alert.

- **`willActuallyTransit` formula — elevation gap instead of full 2D sky separation** — `geometryEnginePhotographer.ts` previously computed `willActuallyTransit = sep <= moonRadius + acRadius` where `sep` is the full 2D sky angular separation (azimuth + elevation) at the dead-reckoned alignment time. For aircraft currently far from the moon (large current angular separation, long lookahead times), the linear azimuth model diverges: the actual azimuth of the aircraft at the predicted time may differ significantly from the moon's azimuth, inflating `sep` even when the elevation gap is small. The fix uses the elevation gap directly — `willActuallyTransit = Math.abs(elevationGapAtAlignmentDeg) <= moonRadius + acRadius` — consistent with the real-world validation (2026-05-23) which confirmed `elevationGapAtAlignmentDeg` is accurate. This aligns the formula with the `ElevationGapBadge` visual threshold (~0.26° = moon apparent radius).

- **`useTransitCandidates` — range-at-alignment filter excludes out-of-range transits** — A candidate whose transit is predicted to occur when the aircraft is > 100 km from the observer is now excluded from the list entirely (not just from `willTransit`). Previously only the aircraft's *current* position was range-checked (in `screenTransitCandidates`); a plane within 100 km now but moving away could appear in "In frame" with its transit predicted 300+ km away — useless for photography. New constant `MAX_TRANSIT_SLANT_METERS = 100_000`. `photographerPack` now exposes `futureSlantMeters: number | null` (the ECEF slant distance at the dead-reckoned alignment position) so `useTransitCandidates` can apply this check.

- **`screening.ts` — initial range filter reduced from 150 km to 100 km** — `MAX_SLANT_RANGE_METERS` was 150 000 m. Reduced to 100 000 m to match the photographable limit stated in the observer radius ring (100 km). At 150 km a 40 m aircraft subtends ~0.011° (< 4 % of moon disc); including these planes created noise in the candidate list with no practical value.

### Added

- **`geometryEnginePhotographer.ts` — `futureSlantMeters` return field** — `photographerPack` now includes `futureSlantMeters: number | null`: the ECEF slant range from observer to the dead-reckoned aircraft position at the predicted azimuth-alignment time. `null` when `timeToAlignmentSec` is null (no alignment predicted). Used by `useTransitCandidates` for the range-at-alignment filter.

- **`moonFieldVisibilityAdvice.ts` — `CRITICAL_BELOW_DEG` exported** — The `5°` threshold that defines the "Critical / Hidden" tier is now an exported constant so domain logic and UI can share the same value without duplication.

- **`useTransitCandidates` + `useActiveTransits` — minimum moon altitude raised from 0° to 5°** — Both hooks previously returned candidates / active transits whenever the moon was above the mathematical horizon (`altitudeDeg > 0`). The moon at 0–5° elevation is labelled "Critical / Hidden — Too low, likely blocked by horizon" in `MoonEphemerisPanel`, yet the old guard allowed candidates and alerts to appear in that range — a contradiction. Both hooks now use `moon.altitudeDeg < CRITICAL_BELOW_DEG` (5°) as the early return, matching the same threshold displayed to the user.

---

## [2026-05-24] — Transit Candidate Screening: Direction + Range Filters, Observer Ring 80 km

### Changed

- **`screening.ts` — hard filter: diverging aircraft removed** — `screenTransitCandidates` now rejects any aircraft whose angular separation from the moon is *increasing*. For each flight with a known `trackDeg` and `groundSpeedMps`, the position is extrapolated 30 s forward; if the future angular separation ≥ the current one the aircraft is moving away from the moon and is dropped from the candidate list. Flights without speed/track data (rare) pass the direction check unconditionally. Previously, the list included all aircraft sorted by current separation regardless of direction — a diverging aircraft at 30° could appear above a converging one at 35°.

- **`screening.ts` — hard filter: slant range ≤ 150 km** — Aircraft farther than `MAX_SLANT_RANGE_METERS = 150 000 m` are dropped before any angular math is done. At 150 km a 40 m aircraft subtends ~0.015° (~3 % of the moon disc diameter) — below that threshold transit photography is not meaningful. The range check is evaluated using the existing `slantRangeMeters` (ECEF-based) helper, which is cheaper than the subsequent horizontal-coordinate math.

- **Observer ring on map — 80 km (was 100 km)** — `useMapObserverRadiusSync` now draws the dashed ring at 80 km. At 80 km a typical airliner subtends ~0.029° (~6 % of the moon disc), which represents a practical lower limit for recognisable silhouette photography with a 600 mm lens. The ring now visually communicates the "worth watching" zone rather than the API query radius (which remains 100 km in `openSkyStyleQueryRegion.ts`).

- **`TransitCandidate` type — `elevationGapDeg` field** — New optional field `elevationGapDeg: number | null` added to `TransitCandidate` (`src/types/transit.ts`). Holds the signed elevation difference (aircraft − moon) at predicted azimuth alignment, sourced from `photographerPack.elevationGapAtAlignmentDeg`. `screening.ts` sets it to `null` (screening is camera-agnostic and does not run `photographerPack`); it is populated in `useTransitCandidates`.

- **`useTransitCandidates` — `photographerPack` enrichment + two additional filters** — After `screenTransitCandidates`, the hook now runs `GeometryEngine.photographerPack` for every screened candidate and applies two further gates: (1) **azimuth alignment must be predicted** — if `pack.timeToAlignmentSec` is `null` the aircraft's current track will never reach the moon's azimuth, so it is dropped (fixes false positives where a plane was momentarily converging in 2D sky-sphere separation but on a non-intersecting heading); (2) **elevation gap ≤ 2°** — a miss larger than ~4 moon diameters has no astronomical relevance regardless of optics; transit candidate filtering is intentionally camera-agnostic (focal length affects framing, not whether a transit occurs). The `elevationGapDeg` field is populated from `pack.elevationGapAtAlignmentDeg` for surviving candidates.

- **`TransitCandidatesPanel` — `ElevationGapBadge`** — Each candidate row now shows a second line with the predicted elevation gap at alignment: emerald when `|gap| ≤ 0.26°` (within the lunar disc — transit confirmed), amber for `0.26°–1.5°` (close near-miss), muted for `> 1.5°`. Missing when `photographerPack` could not compute an alignment.

- **`shotFeasibility.ts` — `CAMERA_SENSOR_HEIGHT_MM` and `verticalFovDeg`** — Added a physical sensor-height table (`fullFrame` 24 mm, `apsC` 15.6 mm, `apsC16` 14.9 mm, `microFourThirds` 13 mm) and a `verticalFovDeg(focalLengthMm, sensorType)` helper for downstream use in framing tools. Transit candidate filtering does **not** use these values — they are reserved for photographer advisory features.

---

## [2026-05-23] — 3D Transit Prediction: Elevation Gap, Confirmed-Transit Badge

### Added

- **`photographerPack` — full 3D transit prediction (`willActuallyTransit`)** — After computing the azimuth-alignment ETA, the function now projects the aircraft's future position along a great circle (spherical-Earth dead reckoning: `deadReckonPosition` in `geometryEnginePhotographer.ts`) to the predicted alignment time, looks up the moon state at that future instant, and computes the full 2D sky angular separation (azimuth + elevation). Three new return fields:
  - `willActuallyTransit: boolean` — `true` only when the sky separation at alignment ≤ moon apparent radius + aircraft angular radius. This is the definitive "yes, it will cross the disk" flag.
  - `separationAtAlignmentDeg: number | null` — exact sky separation at that moment.
  - `elevationGapAtAlignmentDeg: number | null` — signed elevation difference (aircraft − moon) at alignment. Negative = aircraft will pass below the moon; positive = above. When `|gap| < ~0.26°` (moon radius) and `willActuallyTransit` is true the badge is green.

- **Map — green ring badge (`CONFIRMED_TRANSIT_BADGE_LAYER_ID`)** — A green circle-stroke layer (radius 12, stroke `#22c55e`, 2.5 px) is rendered on top of every aircraft whose `isConfirmedTransit` GeoJSON property is `true`. That property is set by `computeConfirmedTransitFlightIds` (`src/lib/domain/transit/computeConfirmedTransitFlightIds.ts`) — a new function that runs `photographerPack` for every transit candidate and collects IDs where `willActuallyTransit === true`. Computed and passed from `MapContainer` via `useMapGeoJsonSync`; recalculated on every ADS-B tick. Layer registered in `addConfirmedTransitBadgeLayer` (called inside `registerMoonTransitLayers`).

- **PhotographerToolsPanel — transit confirmation badge** — Below the countdown timer, a coloured pill now shows:
  - **"Disk transit confirmed"** (emerald) — aircraft will actually cross the moon disk at alignment.
  - **"Azimuth only — elevation miss (Δalt ±X.XX°)"** (amber) — azimuth will align but the aircraft will be `X.XX°` above or below the moon. The sign is the same as `elevationGapAtAlignmentDeg` (negative = aircraft passes below).
  Two new data rows in the kinematic table: **Sky separation at alignment** (coloured green/amber) and **Elevation gap at alignment**.

### Changed

- **`useActiveTransits` — full sky angular separation (was azimuth-only)** — The hook previously filtered aircraft by `azimuthDeltaDeg(moon, aircraft) ≤ 0.5°`, ignoring the elevation component. It now uses `angularSeparationDeg({ altitudeDeg, azimuthDeg }, moonDir)` — the great-circle angle on the celestial sphere — as the threshold. Aircraft that happen to share the moon's azimuth but sit at a significantly different elevation angle (common for distant traffic) no longer appear as "active transits." `ActiveTransitRow.deltaAzDeg` renamed to `separationDeg` (consumers updated: `ActiveTransitsPanel`, `HomePageClient`, `useHomeShellOrchestration`, `useTransitCandidateNotifications`).

- **`useNearestTransitWindow` — full sky angular separation (was azimuth-only)** — `minAzimuthForFlights` replaced by `minSkyAngularSepForFlights`: sweeps the 24-hour slider window and, at each step, computes the 2D angular separation for every flight. The "nearest window" is now the time at which an aircraft is closest to the moon **on the full celestial sphere**, not just in the azimuth dimension. Also adds a moon-below-horizon guard (returns 180° when `moon.altitudeDeg ≤ 0` so below-horizon steps are never reported as the best window).

- **`ActiveTransitsPanel` description text** — Updated from *"Moon and aircraft azimuth (from altitude) within 0.5°"* to *"Aircraft within 0.5° of the moon disc — full sky separation (azimuth + elevation)"* to reflect the corrected metric.

- **`PhotographerToolsPanel` countdown label** — Changed from *"Time until moon and plane line up"* to *"Time until azimuth alignment"* to distinguish azimuth-alignment time from the more precise disk-transit confirmation above it.

### Validated

- Real-world test (2026-05-23): the app predicted a small negative `elevationGapAtAlignmentDeg` (aircraft would pass just below the moon), and the resulting photograph confirmed this exactly — the aircraft passed immediately below the lunar limb with contrails visible.

---

## [2026-05-22] — Flight Log Panel: Airline Logos, Callsign Route History & Mean Path

### Added

- **Flight Log panel** — New shell panel (`panelRegistry` id `"flightlog"`, `wide: true`) that lists all distinct aircraft seen by the local ADS-B receiver. Supports three time ranges (24 h / 7 d / 30 d) as pill buttons. Columns: airline logo | Carrier | Callsign | Reg | Type. Pagination: 50 rows per page.

- **Flight Log — client-side search including carrier name** — The panel fetches up to 1,000 rows for the selected window (no server-side search) so that `callsignToCarrier()` can filter by full airline name on the client. Typing "croatia" now matches Croatia Airlines (CTN prefix) even though the word does not appear in the callsign or registration. Search is debounced 350 ms; a clear × button appears when there is input.

- **Flight Log — airline logo column** — `AirlineLogo` component uses `callsignToKiwiIata()` to resolve the ICAO 3-letter designator to an IATA code and loads the airline logo from the Kiwi CDN (`https://images.kiwi.com/airlines/64x64/{IATA}.png`) — same CDN used in the aircraft map popup. Falls back to a dashed placeholder box when the IATA mapping is unknown or the image fails to load.

- **Flight Log — `callsignToCarrier` and `callsignToAirlineFlag`** — New `src/lib/flight/icaoAirline.ts` with 110+ ICAO 3-letter designator → airline name mappings and designator → home-country flag emoji. `callsignToCarrier` is used in the Flight Log carrier column and in client-side search.

- **Flight Log — `callsignToKiwiIata`** — Added to `src/lib/flight/flightDisplayLabels.ts`; accepts a raw callsign string (not a `FlightState`) and returns an IATA code for the Kiwi logo URL, or `null` if unknown.

- **Flight Log — reg/type fallback from positions table** — `getAircraftList` SQL now uses `COALESCE(a.registration, MAX(p.registration))` and `COALESCE(a.aircraft_type, MAX(p.aircraft_type))` so that reg and type are populated even when the `aircraft` metadata table is sparse (e.g. when readsb does not enrich the aircraft).

- **Flight Log — row click draws route on map** — Clicking a row with a callsign sets `flightLogSelectedCallsign` in the store, which triggers `useCallsignHistoryLayer` to draw session lines + mean path for that callsign. Clicking an ICAO24-only row sets `flightLogSelectedIcao24` + `flightLogDaysBack`, which triggers `useSelectedFlightTrail` to draw the historical track for that aircraft. A selection hint chip at the bottom of the panel shows what is active and provides an × clear button.

- **Map — callsign session history and mean path (`useCallsignHistoryLayer`)** — New hook watching `flightLogSelectedCallsign` + `flightLogDaysBack`. On selection, fetches `/api/flight-log/callsign-analysis` and populates two Mapbox sources:
  - **Session lines** (`callsign-sessions-geo` / `callsign-sessions-layer`) — one `LineString` per flight session through the local ADS-B coverage area; thin (1.5 px), sky-400 at 28 %, slight blur. Overlapping sessions accumulate naturally into a heat corridor without a separate heatmap layer.
  - **Mean path** (`callsign-mean-geo` / `callsign-mean-layer`) — spatial-bin average computed server-side: primary axis (lng or lat, whichever spans more) is binned at 0.04°; bins with ≥ max(1, 40 % of sessions) are kept; secondary coordinates are averaged; result is a `LineString` oriented to match the first session's direction. Rendered as a glow pass (7 px, blur 4) behind a crisp centre line (2.2 px, sky-200 at 92 %).

- **API — `/api/flight-log/callsign-analysis`** — New route handler. Returns `{ sessions: FeatureCollection, mean: FeatureCollection, sessionCount }`. Sessions are grouped from the `positions` table by 20-minute time gaps; sessions with < 3 points are discarded; long sessions are sub-sampled to ≤ 150 evenly-spaced points. Mean path uses the spatial-bin algorithm described above.

- **API — `/api/flight-log/aircraft-list`** — New route handler returning `{ rows: AircraftListRow[], total }`. Used by the Flight Log panel.

- **Store — Flight Log selection fields** — Added to `moon-transit-store`:
  - `flightLogSelectedIcao24 / setFlightLogSelected(icao24, days?)` — drives `useSelectedFlightTrail` with an extended window.
  - `flightLogSelectedCallsign / setFlightLogSelectedCallsign(callsign)` — drives `useCallsignHistoryLayer`.
  - `flightLogDaysBack` — time window (days) for the ICAO24 trail (up to 720 h / 30 days).

- **`useSelectedFlightTrail` extended** — Now also handles `flightLogSelectedIcao24`. When a Flight Log ICAO24 selection is active it takes priority over the live trail; it fetches `track/[icao24]?hours=N` with `N = daysBack × 24` (capped at 720 h).

- **`track/[icao24]` hours cap raised** — Max `hours` parameter raised from 168 (7 days) to **720** (30 days) to support the Flight Log panel's 30-day time range.

- **`PanelDef.wide` flag** — `panelRegistry.tsx` `PanelDef` type now accepts an optional `wide?: boolean`. When `true`, `FloatingRail` renders the panel drawer at `w-[min(50vw,960px)]` instead of the default `w-[420px]`. The `"flightlog"` panel uses this to show the full table comfortably.

## [2026-05-22] — Transit detection fix + AR camera improvements

### Fixed

- **Transit detection used stale ADS-B positions** — `useActiveTransits`, `screenTransitCandidates`, `computeShotFeasibleFlightIds` and `useTransitFieldSounds` all computed aircraft angular position from the raw `f.position` in the store, ignoring how old the data was. OpenSky free API timestamps (`time_position`) can be 5–15 minutes old; an aircraft at 250 m/s moves ~150 km in 10 minutes, so the app was flagging transits that had already ended or had not yet started. Fix: each of these functions now calls `extrapolateFlightForDisplay(f, Date.now(), latencySkewMs)` before passing the position to `horizontalToPoint`. `openSkyLatencySkewMs` is read from the store where it was not previously used in transit geometry. Fix is source-agnostic: for fresh sources (localsdr, adsbone) `f.timestamp` is seconds old so extrapolation is negligible; only stale OpenSky data is materially corrected.

- **Extrapolation cap too conservative** — `EXTRAPOLATE_DT_CAP_SEC` was 45 s, meaning positions older than 45 s were frozen. Raised to **900 s** (15 minutes) to cover the full realistic OpenSky API staleness window. `MAX_LEAD_SEC` (40 s predictive lead for display smoothing) is unchanged.

### Added

- **AR camera — diagnostic info bar** — A small monospace strip above the compass widget shows in real time: camera heading `↑ 085°`, camera pitch `∠ +32°`, flight data age in seconds (green < 120 s, red otherwise), and moon azimuth/altitude `☽ 210°/28°`. Allows the user to verify sensor readings and data freshness without leaving the AR view.

- **AR camera — elevation angle on aircraft labels** — Every visible and offscreen aircraft marker now shows its elevation angle: `THY3VD +12°`. Allows the user to understand why an aircraft labelled in the AR is not visible to the naked eye (low elevation, very distant).

- **AR camera — moon tap calibration (`Cal ☽`)** — The bottom bar "Reset cal" button is replaced by a three-state "Cal ☽" button. When tapped, the overlay shows "Tapni gdje stvarno vidiš Mjesec u kameri" and the user taps the real moon position in the camera frame. The app computes `calibrationOffsetDeg = normalizeSignedAngleDeg(moon.azimuthDeg − headingDeg − tapDxDeg)` and applies it to all AR projections, correcting magnetic interference without requiring the user to move. The button turns green and shows `Cal +X°` while a non-zero offset is active; tapping it again resets to 0.

### Changed

- **AR camera — altitude filter raised** — Aircraft with `altitudeDeg < 0°` are no longer shown in the AR overlay (was `< −5°`). Aircraft technically below the horizon were being labelled in AR but were invisible to the eye.

- **AR camera — compass accuracy thresholds tightened** — Badge colours now change at ≤ 10° (green) / ≤ 20° (amber) / > 20° (red), down from ≤ 15 / ≤ 30. The magnetic interference warning (previously text shown only above 30°) now appears above **15°** so that a typical balcony-near-crane reading of ±26° immediately shows a red warning with an explanation.

## [Unreleased]

### Added

- **Flight history logging — local ADS-B position log** — When the LunaPic ADS-B (localsdr) source is active, `server.js` continuously logs aircraft positions to a local SQLite database (`data/flight-log.db`) on the server. The background poller (`startFlightLogger()`) runs in `server.js` alongside the Next.js app: it polls the Pi's `aircraft.json` every 15 s, writes each aircraft with a valid position to an in-memory sql.js database, and saves a snapshot to disk every 30 s (plus after each batch write and on process exit/SIGTERM). On startup, `server.js` loads any existing DB file from disk so the history survives restarts. De-duplication: a position is only written if the aircraft has moved > 120 m or > 90 s have passed since the last log entry for that ICAO24. Schema: `positions` table (id, icao24, callsign, lat, lng, alt_baro_m, alt_geom_m, speed_mps, track_deg, vert_rate_fpm, squawk, rssi, registration, aircraft_type, logged_at) + `aircraft` table (metadata per ICAO24; upserted on each write using `ON CONFLICT … DO UPDATE SET … = COALESCE(excluded.field, field)`). Indexes on icao24, logged_at, callsign.

- **Flight history — extended ADS-B fields from readsb** — `LocalSdrAircraft` type and `parseLocalSdrAircraft.ts` now extract additional fields from the readsb `aircraft.json` payload: `r` (registration), `squawk`, `baro_rate` / `geom_rate` (vertical rate, ft/min), `rssi`, `desc` (aircraft description from readsb database). These are mapped to `FlightState.registration`, `squawk`, `verticalRateFpm`, `rssi`, `aircraftDescription` and are stored in the flight log.

- **Flight history — sql.js (pure WASM SQLite)** — The database layer (`src/lib/db/flightLogDb.ts`) uses **sql.js** (pure JavaScript + WebAssembly port of SQLite) rather than a native addon. No native compilation is needed, making it suitable for cPanel shared hosting. Key pattern: `require("sql.js")` is called inside a function body (not a top-level import) with a `locateFile` callback pointing to the absolute path of `sql-wasm.wasm`. This avoids both Turbopack's module-name mangling bug (packages with dots get hash-suffixed IDs when listed in `serverExternalPackages`) and ESM/CJS interop problems. The singleton `_sqlPromise` caches the init result across requests. API routes each open a fresh read-only in-memory copy of the DB file per request (`openReadDb()`).

- **Flight history — API routes** — Five new Route Handlers under `src/app/api/flight-log/`:
  - `track/[icao24]` — returns a GeoJSON `FeatureCollection` with a single `LineString` of `[lng, lat, alt_baro_m]` coordinates for the requested aircraft in the given time window (`?hours=N`, default 24, clamped 0.5–168).
  - `heatmap` — returns a GeoJSON `FeatureCollection` of `Point` features with a `weight` property (normalised hit count), suitable for a Mapbox `heatmap` layer. Grid resolution configurable (`?res=0.05`), time window `?days=7`.
  - `routes` — returns a GeoJSON `FeatureCollection` of `LineString` features, one per callsign with ≥ 10 points in the window (`?days=30`). Long routes are evenly sub-sampled to ≤ 500 points.
  - `stats` — returns `{ total, last24h, uniqueIcao, topCallsigns }` — overall DB statistics.
  - `aircraft/[icao24]` — returns aircraft metadata row (registration, type, description) or `null`.
  All routes are `force-dynamic` with `no-store` caching. SQL errors return an empty result rather than a 500 so a missing or incomplete DB never crashes the UI.

- **Map — historical trail behind selected aircraft** — When the LunaPic ADS-B (localsdr) source is active and an aircraft is selected, a line is drawn on the map showing where that aircraft has been in the past 2 hours (`useSelectedFlightTrail` hook). The trail uses a Mapbox `line-gradient` with `lineMetrics: true` on the source: fully transparent at the oldest end, fading up to amber `rgba(253, 230, 138, 0.9)` at the current position. In-flight fetch requests are cancelled via `AbortController` when the selection changes. The trail is cleared when the aircraft is deselected or localsdr is disabled. Source: `selected-flight-trail-geo`; layer: `selected-flight-trail`.

- **Map — flight history heatmap and route lines** — Two optional map overlays driven by the flight log:
  - **Density heatmap** (`flight-history-heatmap-layer`) — shows where aircraft have flown most frequently over the past 7 days; uses Mapbox `heatmap` layer with `heatmap-weight` from the `weight` property. Colour ramp: blue (sparse) → green → yellow → red (dense). Max zoom 14.
  - **Route lines** (`flight-history-routes-layer`) — semi-transparent cyan polylines (`rgba(100,200,255,0.22)`) per callsign, last 30 days. Blurred slightly for a soft overlay feel.
  Both are toggled from the Layers panel (new "Flight history" section with two switches). State: `flightHistoryHeatmap` and `flightHistoryRoutes` booleans in `moon-transit-store` (both default `false`). Data is lazily fetched when first enabled and refreshed every 5 minutes (`useFlightHistoryLayers` hook).

- **UI — green zone (shot-feasible) alert** — A new `GreenZoneAlert` floating card appears when one or more aircraft enter the **shot-feasible** (green) zone — that is, they satisfy both geometric moon-disc overlap (`screenTransitCandidates`) *and* optical range for the current focal length / sensor crop (`computeShotFeasibleFlightIds`). The card uses an amber/gold colour scheme to visually distinguish it from the emerald `IncomingTransitAlert` (which signals moon-ray alignment). It shows the callsign of the first feasible aircraft and a count badge. Tapping the card opens the **Photo tools** panel; the × button dismisses it until the feasible count changes. Rendered in both desktop (absolute, above the transit alert) and mobile (compact, above the time ribbon) layouts. State: `greenDismissedAtCount` in `HomePageClient` (same derived-state pattern as `dismissedAtCount`). No new store fields required — `cameraFocalLengthMm` and `cameraSensorType` are read directly from `moon-transit-store` inside `HomePageClient`.

## [2026-05-19] — AR Module: Full Sensor Fix

### Fixed

- **AR Sky Camera — wrong camera azimuth (+180° removed)** — `webkitCompassHeading` with iOS tilt compensation already gives the rear camera's horizontal azimuth directly; no offset is needed. The previous `+180°` correction placed all sky objects 180° opposite their true position — the compass showed South where North should be, and the Moon could not be centred because tilting toward it sent it further off-screen. Formula is now `(headingDeg + calibrationOffsetDeg + 360) % 360`. Confirmed by `CompassAimPanel`, which uses `headingDeg` with no offset and produces a correct compass display.

- **AR Sky Camera — inverted pitch formula** — `toCameraPitchDeg(beta)` used `90 − beta`, which gives *negative* pitch when the camera tilts upward. The rear camera is on the back of the phone: tilting to view the sky brings the screen face-down and **increases** beta (90° upright → 180° flat screen-down = camera up). Correct formula is `beta − 90`: beta 90° → 0° (horizontal) ✓; beta 180° → 90° (zenith) ✓; beta 0° (screen up, camera pointing at floor) → −90° ✓. The previous formula (`90 − beta`) caused the Moon's off-screen arrows to point users in the wrong vertical direction.

- **AR Sky Camera — off-screen arrows pointing in the wrong vertical direction** — `dyDeg = altitudeDeg − pitchDeg`. When `dyDeg > 0` the target is above the frame; the arrow must point **up** (`rotate(0deg)` on ▲). The bug had `dyDeg > 0 → rotate(180deg)` (▼), so tilting toward the arrow moved the target further off-screen. Fixed in both `offscreenArrows` (aircraft) and `moonOffscreenArrow`.

- **AR Sky Camera — heading oscillation / Moon jumping to screen edge** — raw `webkitCompassHeading` can spike by tens of degrees due to magnetic glitches. Added two-stage filtering: (1) **outlier rejection** — skip any sample that deviates > 45° from the smoothed heading (physically impossible by hand); (2) **warmup alpha** — use alpha = 0.25 for the first 60 samples (~1 s) for fast initial lock-on, then alpha = 0.06 for long-term stability. `headingSamplesRef` is reset each time the AR view opens.

- **AR Sky Camera — Recenter button used an invalid formula** — `normalizeSignedAngleDeg(prev − headingDeg)` set the calibration offset to a mathematically incoherent value. Recenter now resets `calibrationOffsetDeg` to `0`.

### Added

- **AR Sky Camera — compass accuracy indicator** — reads `webkitCompassAccuracy` (iOS) from each `deviceorientation` event and displays a `±N°` badge below the compass rose: green (≤ 15°), amber (≤ 30°), red (> 30°). When accuracy exceeds 30° a banner warns about magnetic interference and advises moving away from metal structures. The badge is suppressed when the value is unavailable (non-iOS or sensor not reporting).

## [2026-05-17] — Moon Nowcast Phase Warning & Aircraft Scale Fix

### Added

- **Moon (nowcast) — illumination phase warning in Visibility Advice** — `MoonEphemerisPanel` now shows a **Phase** row under Visibility Advice when the lunar illumination fraction is below 20 %. Below 5 % (near new moon) a red warning reads *"Near new moon — Moon too dark to photograph — not visible to the naked eye."*; 5–20 % (thin crescent) shows an amber caution *"Thin crescent — Low contrast — hard to locate; best in twilight near horizon."* At ≥ 20 % no row is shown (moon is bright enough for photography). The advice is computed by a `illuminationAdvice` memo inside `MoonEphemerisPanel`, derived from `moon.illuminationFraction`.

### Changed

- **Map — 3D aircraft icons scale correctly at max zoom** — `FLIGHT_MODEL_SCREEN_SIZE_MIN_FACTOR` in `registerMoonTransitLayers.ts` further reduced from `0.3` to `0.02`. At zoom 16 the unclamped scale factor is `2^(11−16) ≈ 0.031`, so the floor no longer clamps it and models shrink to their natural screen size when fully zoomed in. The `0.02` floor only prevents models becoming invisible at extreme zoom ≥ 17.

## [2026-05-17] — Map Flight Display, Moon Path Circle & Observer Radius

### Added

- **Map — observer API radius circle** — A new thin dashed ring (`#94a3b8`, opacity 0.35) is drawn on the map at exactly 100 km from the observer, matching the bounding radius used for flight API queries. Source `observer-radius-geo` and layer `observer-radius-layer` are registered in `registerMoonTransitLayers.ts`; `useMapObserverRadiusSync` (new hook) generates a 120-point GeoJSON `LineString` using `destinationByAzimuthMeters` and updates the source whenever the observer position changes. Note: the API query uses a rectangular bbox, so flights may appear slightly outside the circle in the diagonal corners (~141 km max); this is expected and by design.

### Changed

- **Map — 3D aircraft icons scale correctly at high zoom** — `FLIGHT_MODEL_SCREEN_SIZE_MIN_FACTOR` in `registerMoonTransitLayers.ts` reduced from `1.4` to `0.3`. Previously the minimum factor kicked in at zoom ≥ 11, causing models to grow progressively larger on screen as the user zoomed in (world-space size constant while screen pixels multiplied). Models now shrink proportionally beyond the reference zoom, keeping apparent screen size roughly constant across all zoom levels.

- **Map — sideways aircraft icons fixed** — When `trackDeg` is unavailable (ground traffic, poor ADS-B signal), the feature property `track` is now set to `null` instead of `0`. The 3D model layer gains `filter: ["!=", ["get", "track"], null]` so aircraft without valid heading are not rendered as 3D models (they remain visible as the circle fallback layer). Previously `track = 0` caused the yaw offset to produce an east-facing (sideways) model for all untracked aircraft — a frequent occurrence at busy airports like Schiphol where many ground vehicles report no track.

- **Map — ghost effect for stale ADS-B data** — A `staleness` property (`0.0` = data <15 s old, `1.0` = data >45 s old, linear) is computed in `useMapGeoJsonSync` from `Date.now() − f.timestamp`. The 3D model layer interpolates `model-opacity` from `1.0` to `0.28` by staleness; shadow and circle-fallback layers do the same with `circle-opacity`. Aircraft with weak or infrequent ADS-B pings visually fade out, distinguishing frozen positions from live ones.

- **Map — moon path circle always 80 % of viewport height** — `useMapMoonOverlayFeatures` now accepts a `mapHeightPx` parameter (default `0`). When the map height is known, `dynamicRayM` is computed as `0.4 × mapHeightPx × metersPerPixel` (Mapbox 512-px tile formula at observer latitude) so the full-day moon path ring always subtends 80 % of the viewport height regardless of zoom. `MapContainer` provides `mapHeightPx` via a `ResizeObserver` on the map element. The old zoom-scaling formula is retained as a fallback for the initial render before the observer fires.

- **Map — moon path smoothness improved** — Full-day circle sampling step reduced from 30 min to **5 min** (`fullDaySamples` in `useMapMoonOverlayFeatures`), increasing ring sample count from ~48 to ~288 points per day. Primary visible-arc sampling also reduced to 5 min via an optional `stepMs` parameter added to `AstroService.getMoonPathMapSpec`. Both arcs now render without visible straight-line segments at city-level zoom.

- **Flights — observer relocation immediately clears out-of-range aircraft** — Moving the observer now calls `pruneFlightsToObserverRadius(lat, lng, 100)` synchronously before the debounced API refresh. Previously, aircraft from the old location remained visible for up to 32 s (retention window) because `mergeFlightsWithOpenSkyRetention` checked map-viewport bounds rather than observer distance. The new store action (`pruneFlightsToObserverRadius`) filters the in-memory flight list by `greatCircleDistanceMeters` ≤ 100 km, matching the query radius exactly.

## [2026-05-17] — Astronomy Engine, AR Sky Moon Marker & Street View Improvements

### Changed

- **Astronomy — replaced `suncalc` with `astronomy-engine` (USNO-grade ephemeris)** — `src/lib/domain/astro/moon.ts` `getMoonState()` now uses `Astronomy.Equator()` + `Astronomy.Horizon()` with atmospheric refraction instead of SunCalc's simplified lunar theory. Accuracy improves from ~0.25° azimuth / ~0.5° altitude (roughly one Moon diameter) to <1 arcminute. Phase and illumination calculation likewise migrated to `Astronomy.MoonPhase()` and angular elongation — SunCalc is no longer used for these values. **Reason:** SkyView and LunaPic showed the Moon at visually different positions; the SunCalc error was large enough to affect transit-photography framing in the field.

- **Astronomy — observer elevation propagated to `getMoonState`** — `getMoonState` now accepts a 4th argument `observerElevM = 0` (metres above sea level). Every call site now passes `observer.groundHeightMeters` so the atmospheric refraction model reflects the actual observer altitude instead of assuming sea level.

- **Astronomy — `AstroService` facade** — All moon-position calls go through `AstroService` in `src/lib/domain/astro/astroService.ts`. Direct use of SunCalc in application code is removed.

### Added

- **AR Sky Camera Panel — Moon marker and off-screen compass arrow** — `src/components/field/ArSkyCameraPanel.tsx` now shows the Moon in the AR overlay when it is within the camera's field of view: a `○` marker with an amber "Moon" label. When the Moon is outside the viewport, an off-screen edge arrow (▲ + label "Moon", same pattern as aircraft arrows) points toward it. `moonScreen` is extended with `dxDeg` and `dyDeg` fields for the arrow angle computation; `moonOffscreenArrow` is a new `useMemo` that produces the arrow's edge position and rotation.

- **Street View — rotated aircraft icon** — Aircraft in `src/components/map/StreetViewFullscreen.tsx` now render as a custom canvas silhouette drawn by `tracePlane()`, oriented correctly upward (−Y) and rotated by the `trackDeg` projected onto the screen. This replaces the `✈` emoji, which has an inconsistent font-rendering orientation across platforms.

- **Street View — 90-second radar-style trajectory for active transits** — Active-transit aircraft in Street View show a 90-second predicted trajectory: a series of shrinking dots extending 15 km forward plus an arrowhead at the end. Candidate aircraft show only the icon and label (no trajectory) to reduce visual noise.

- **Street View — visual hierarchy** — Active transits render at size 10 with a glow effect and trajectory; candidates render at size 6 without a glow. `bearingOffsetLatLng()` helper (haversine forward computation) is added to `StreetViewFullscreen.tsx` to project the future aircraft position from current track.

## [2026-05-17] — Security, Architecture & Error Monitoring

### Added

- **Security — in-memory rate limiter for API routes** — `src/lib/server/rateLimiter.ts` implements a sliding-window per-IP rate limiter (60 req/60 s default). Works reliably on cPanel's persistent Node.js process. Both `/api/opensky/states` and `/api/adsbone/point` now return `429 Too Many Requests` with a `Retry-After` header when the limit is exceeded. Auto-prunes expired entries every 5 minutes via an unref'd `setInterval`.

- **Architecture — panel registry** — `src/components/shell/panelRegistry.tsx` is the single source of truth for all shell panels. Each `PanelDef` entry holds `id`, `label`, `dockLabel`, `mobileTitle`, `icon`, `accent`, and `dockPrimary`. `HomePageClient` now derives `RAIL_ITEMS`, `DOCK_PRIMARY`, `MORE_PANELS`, mobile sheet titles, and accent colours directly from the registry — previously these were defined across 5 separate static constants. Adding a new panel now requires changes in 2 places instead of 5.

- **Architecture — VFR region config** — `src/lib/map/vfrRegionConfig.ts` centralises all Croatia-specific VFR map data: `label`, `tileBounds`, and `borderRing`. Replaces the old `croatiaVfrBorder.ts` (anonymous coordinate array without context) and the hardcoded `CROATIA_TILE_BOUNDS` constant in `registerMoonTransitLayers.ts`. The new file includes instructions for adapting the app to a different region.

- **Error monitoring — Sentry (client-side)** — `@sentry/nextjs` integrated for browser-side error capture. `sentry.client.config.ts` initialises Sentry in production only (`enabled: NODE_ENV === "production"`), with session replay on error (`replaysOnErrorSampleRate: 1.0`) and 10 % performance trace sampling. Server-side instrumentation omitted due to Turbopack/`require-in-the-middle` incompatibility on cPanel Node.js. DSN stored in `NEXT_PUBLIC_SENTRY_DSN` env var; `SENTRY_AUTH_TOKEN` available for source map uploads.

- **Documentation — senior developer code review** — `documentation/code-review-analiza.md` contains a full SOLID analysis, security audit, dead code review, modularity assessment, and prioritised improvement proposals for the current codebase state.

### Fixed

- **Security — missing numeric validation on `/api/opensky/states` bbox params** — Parameters `lamin`, `lomin`, `lamax`, `lomax` are now validated with `Number.isFinite()` and geographic range checks (`lat` −90…90, `lng` −180…180) before being forwarded upstream. Previously only presence was checked. Matches the existing validation in `/api/adsbone/point`.

### Removed

- **`src/lib/map/croatiaVfrBorder.ts`** — Replaced by `vfrRegionConfig.ts`. The export `CROATIA_BORDER_MAIN` is superseded by `VFR_REGION_CONFIG.borderRing`.

### Changed

- **`HomePageClient.tsx` — icon imports reduced** — 9 of 12 `SectionIcon*` imports moved to `panelRegistry.tsx`; only `SectionIconTime` and `SectionIconQuestionMarkCircle` remain directly imported in `HomePageClient`.

- **`next.config.ts` — `serverExternalPackages`** — Added `@sentry/nextjs`, `@sentry/core`, and `require-in-the-middle` as server external packages to prevent Turbopack from bundling them with hashed module IDs that can't be resolved at runtime.

### Deploy notes (cPanel)

- After any deploy that **removes** a file from the build, that file must be manually deleted on the server — FileZilla only uploads changed/new files and does not delete removed ones. Example: `rm /home/drusanyc/LunaPic/.next/server/instrumentation.js`
- New npm packages require `npm install` on the server after upload: `source /home/drusanyc/nodevenv/LunaPic/20/bin/activate && cd /home/drusanyc/LunaPic && npm install`

### Added

- **Active transits — directional nudge arrow with live distance** — `ActiveTransitsPanel` now renders a `NudgeArrow` below the flight list (outside the scrollable `<ul>`) when a flight is selected. The arrow is an SVG rotated to the true compass bearing the observer should walk, displayed with a smooth 500 ms CSS transition. Below the arrow a large monospace metre counter shows the remaining distance to the centred position; both values update live as the observer position changes in `observer-store`. When the observer is within 5 m, the arrow is replaced by a green checkmark with "Centered". The cardinal direction ("Walk NW", "Walk SE", etc., 8-point) is derived from the same bearing.

- **Active transits — true-bearing nudge geometry** — `alignmentHint.ts` gains a new pure function `nudgeBearing(signedMoonToAcDeg, moonAzDeg)` that computes the correct correction direction: always perpendicular to the Moon's ray (`bearingDeg = moonAzDeg + 90° × sign(signedDiff)`), with distance `|signedDiff| × 600` m (capped at 20 km). The previous `nudgeNorthSouthMeters` heuristic (N/S only, with a `1/cosLat` factor) is still present but no longer used by the active-transits pipeline; `nudgeBearing` is now the single source of truth for both the text line and the arrow. `ActiveTransitRow` drops `nudgeCardinal` and exposes `nudgeBearingDeg` instead; `nudgeLine` is generated from the bearing result so text and arrow always agree.

- **Active transits — centred position chime** — `ActiveTransitsPanel` plays a two-tone rising chime (880 Hz → 1320 Hz, Web Audio API `OscillatorNode`, no external files) the moment `nudgeMeters` drops below 5 m for the selected flight. The `useCenteredChime` hook tracks the previous centred state via `useRef` and fires `playCenteredChime()` only on the `false → true` transition, preventing repeated triggers on every render. The `AudioContext` is created fresh per chime and closed after 1.2 s; if the context is blocked (no prior user gesture), the error is silently swallowed.

### Changed

- **Shell — unified glass header bar (desktop + mobile)** — The individually floating glass capsules (`BrandPill`, `CommandBar`, weather pill, icon buttons) are replaced by a single `<header>` element spanning the full viewport width (`absolute inset-x-0 top-0`), equal on both breakpoints. Height is `calc(3.5rem + env(safe-area-inset-top))`; `padding-top: env(safe-area-inset-top)` pushes content below the notch. The bar uses `bg-[rgba(14,18,42,0.85)] backdrop-blur-xl border-b border-white/[0.09]` — no rounded corners, connected to screen edge. `BrandPill` loses its own glass background (plain hover-opacity button). `CommandBar` becomes a transparent inner pill (`border border-white/[0.08] bg-white/[0.04]`). `TopRightCluster` buttons and `WeatherOverlay` render directly in the bar without individual glass wrappers; a thin `h-5 w-px bg-white/[0.12]` separator divides the weather chip from the action icons. `FloatingRail` position updated to `top-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)]` to clear the new header.

- **Shell — `WeatherOverlay` now visible on mobile** — Previously `WeatherOverlay` only appeared in `TopRightCluster` (desktop). After the header unification it is also rendered in the mobile `<header>` (with the same separator), so cloud cover is always visible regardless of breakpoint.

- **Shell — GPS button in header** — A **Use my GPS** button (emerald, crosshair+dot icon) is added to the header action cluster on both desktop and mobile, positioned before the existing **Set my location here** (amber) and **Focus on me** (sky) buttons. While `s.gpsBusy` is true the icon swaps to a spinning arc; the button is disabled during a pending fix or when `observerLocationLocked`.

### Removed

- **Map — `optimal-ground-line` layer removed** — The light-purple dashed `optimal-ground-geo` source and `optimal-ground-line` layer have been removed from `registerMoonTransitLayers`, `useMapGeoJsonSync`, `useMapMoonOverlayFeatures`, `useMapMoonHorizonDeemphasis`, and `MapContainer`. The `GROUND_OPTIMAL_SOURCE` constant (`mapSourceIds.ts`) and `OPTIMAL_GROUND_HALF_M` constant (`mapOverlayConstants.ts`) are also gone. The underlying domain function `GeometryEngine.buildOptimalGroundPathFeatures` is retained in `geometryEngineMoonRay.ts` but is no longer called at runtime. Reason: the strip showed the observer an "optimal standing position" that had no actionable meaning once the observer marker is already placed — the feature was visually confusing without a supporting UI legend.

- **Map — `routes-geo` / `routes-line` Mapbox source+layer removed** — The GeoJSON source `routes-geo` and violet `routes-line` layer were removed from `registerMoonTransitLayers` and `useMapGeoJsonSync`. The `ROUTES_SOURCE` constant is removed from `mapSourceIds.ts`. The static-route domain data (`routes.json`, `staticRouteUtils.ts`) and moon–route intersection geometry (`GeometryEngine.intersectMoonAzimuthWithStaticRoutes`) are still present but remain inactive behind `ENABLE_STATIC_ROUTE_MAP_OVERLAY = false`.

### Changed

- **Map — moon path zoom-adaptive ray length** — `useMapMoonOverlayFeatures` now reads `mapView.zoom` from `moon-transit-store` and computes a dynamic ray length: `MOON_PATH_RAY_LENGTH_M × 2^(6 − zoom)`, snapped to 0.5-increment zoom levels to avoid excessive recomputation, clamped to `[3 000 m, 2 000 000 m]`. At the default zoom 6 the ray is unchanged (200 km); each zoom level up halves it so the moon path arc stays within the visible viewport. The same `dynamicRayM` is applied to the primary path, the full-day guide, the simulated-instant dot, and all hourly labels so they remain mutually consistent at any zoom level.

- **Moon nowcast — cloud cover prop restored** — `HomePageClient` was not forwarding the `cloudCoverPercent` prop to `<MoonEphemerisPanel>` despite the prop being present in `MoonEphemerisPanelProps` and the value being available in the shell orchestration state. Added `cloudCoverPercent={s.cloudCoverPercent}` to the render call so the Clouds row appears as intended.

- **Time — live clock auto-sync** — `moon-transit-store` gains a `tickLiveTime()` action that advances `timeAnchorMs` and `referenceEpochMs` to `Date.now()` only when `timeOffsetMs === 0` (live mode); it also bumps `ephemerisRefetchKey` when a UTC calendar day crosses. `useHomeShellOrchestration` starts a `setInterval(tickLiveTime, 30_000)` on mount so the NOW moon-position line and the live time cursor stay in sync without accumulating drift over longer sessions.

- **Moon nowcast — removed "Copy field note" button** — The snapshot / copy-field-note button and its associated state (`copyStatus`, `copyFieldNote`, `showSnapshotButton`, `snapshotContext` prop) were removed from `MoonEphemerisPanel`. The panel now only displays ephemeris data and visibility advice; no clipboard action.

- **Moon nowcast — cloud cover in visibility advice** — `MoonEphemerisPanel` receives an optional `cloudCoverPercent: number | null` prop (wired from `useWeatherStore` in `useHomeShellOrchestration`). When non-null, the visibility advice section grows a second row: **Clouds: X% — [description]** (green < 40 %, amber 40–79 %, red ≥ 80 %) below the existing **Elevation** row, so adverse cloud conditions are immediately visible alongside moon altitude quality.

- **Map — 3D corridor volume custom layer (aircraft occlusion fix)** — `src/lib/map/CorridorVolumeCustomLayer.ts` is a new Mapbox `CustomLayer` (`renderingMode: "3d"`) that renders the transit-opportunity corridor volumes with **`gl.depthMask(false)`** during its WebGL render pass. This ensures 3D aircraft models added after the layer are never depth-occluded inside the green volume — the previous `fill-extrusion` approach always wrote depth and caused aircraft to disappear when flying inside the corridor. The layer builds per-face geometry (wall quads + top fan) from GeoJSON `transitOpportunityCorridorVolume` features using `MercatorCoordinate.fromLngLat` at real-metre altitude. `registerMoonTransitLayers` instantiates `CorridorVolumeCustomLayer` before `addFlightsCircleFallback` so flights are added to the GL scene after the custom layer and always win the depth test. The three old `fill-extrusion` corridor-volume layers (`transit-opportunity-corridor-volume-low/medium/high`) are removed. `MapContainer` holds a `corridorVolumeLayerRef` and calls `layer.updateFeatures(transitOpportunityCorridorFeatures)` + `triggerRepaint()` in a `useEffect` when features change.

- **Map — 3D height scale unified to real metres** — All three 3D heights now use a **1:1 real-metre scale** (matching Mapbox's world-space metre conventions): `model-translation Z` for aircraft models (was `altitudeMeters × 0.08`), `CorridorVolumeCustomLayer.ALTITUDE_SCALE = 1.0`, and `fill-extrusion-height` for the blue selected-aircraft stand volume (raw `volumeHeightMeters`). This makes vertical scale proportional to the map's horizontal distances — at a typical map view, 18 km horizontal ≈ 18 km visible, consistent with max cruise altitude ~15 km.

- **Map — blue stand volume hidden when aircraft not toward moon** — `useSelectedAircraftStandCorridorFeatures` accepts a new `moonAzimuthDeg: number` argument (wired from `moon.azimuthDeg` in `MapContainer`). After computing the observer→aircraft azimuth (`hObs.azimuthDeg`), it checks the angular difference against the moon azimuth; if the difference exceeds **25°**, it returns empty features. The blue 3D volume now only appears when the selected aircraft is heading toward the moon's azimuth, making the volume semantically meaningful (it can overlap the green corridor when a real transit opportunity exists).

- **Map — stand corridor spine starts from observer** — `buildStandCorridorSpineLineFeature` in `standCorridorQuads.ts` now accepts an `observer: { lat, lng }` parameter and starts the line from the observer's position instead of `cNear` (500 m offset from the aircraft ground projection). The cyan spine line now visually originates from the camera-icon marker.

- **Map — observer marker anchor changed to center** — `useMoonTransitMap` creates the Mapbox `Marker` with `anchor: "center"` (was `"bottom"`). The observer coordinate now corresponds to the visual centre of the camera icon, so the spine line and corridor geometry connect precisely to the icon centre.

- **ATC style — contrail indicator in label** — The `flights-contrail-badge` circle layer and its separate GeoJSON source are removed. Instead, `buildAtcLeaderGeometry` accepts an optional `contrailLikelihood` string and includes it in the label feature properties. `useMapGeoJsonSync` computes contrail likelihood per flight using the existing `computeContrailLikelihood` call and passes it to `buildAtcLeaderGeometry`. The ATC label `text-field` expression appends **` ~`** (transient) or **` ≈`** (persistent) directly after the callsign on the same line using a `match` expression inside `format`. No badge is shown in 3D mode.

- **ATC style — zoom-responsive label detail** — The `ATC_FLIGHTS_LABEL_LAYER_ID` symbol layer uses a `step` expression on `["zoom"]` for `text-field`: below **zoom 9** only the callsign (+ optional contrail suffix) is shown; at **zoom 9 and above** the full four-line block (callsign, FL, speed, heading) is displayed. This keeps the map readable at country-level zoom without losing detail when zoomed in to city level.

- **Aircraft popup — collapsible card** — `SelectedAircraftPopupContent` gains a `collapsed: boolean` state (default `false`). The header row (airline logo + callsign area) is now a `<button>` that toggles `collapsed`; a chevron SVG rotates 180° when collapsed. When `collapsed` is true, only the header row renders — the data grid, timestamp, and all detail sections are unmounted. The X close button remains independent and always dismisses the card. This is available on all viewports but is primarily useful on mobile where the card otherwise covers a significant portion of the map.

- **Transit candidates panel — full-height list** — The `<ul>` in `TransitCandidatesPanel` had `max-h-56 overflow-y-auto` which constrained the list to 224 px and caused an inner scroll even when the surrounding rail / mobile sheet had ample space. Both constraints are removed; the parent container (rail sidebar or `MobileSheet`) provides the scroll boundary.

### Fixed

- **Map — VFR Map display mode (OpenAIP raster overlay, Croatia only)** — Added a third `**mapDisplayMode**` value `**"vfr"`** (**VFR Map**) alongside the existing `default` (3D Model) and `atc` (ATC Style). In VFR mode the **OpenAIP aeronautical raster overlay** is shown on top of the dark-v11 basemap; aircraft remain in **3D Model** style. The overlay is clipped to Croatian territory via two mechanisms: (a) a Mapbox raster-source `**bounds**` property `[13.0, 42.0, 20.0, 47.0]` that prevents fetching tiles outside the HR region, and (b) a **"world-minus-Croatia" fill mask** (`**vfr-openaip-mask-layer**`) — a GeoJSON `Polygon` with a large outer ring covering all of Europe and a 292-point inner ring (hole) following Croatia's simplified OSM border (`**src/lib/map/croatiaVfrBorder.ts**`, Nominatim `polygon_threshold=0.02`); fill color `#141c2b` (dark-v11 background approximation). Both layers (`**VFR_OPENAIP_LAYER_ID**`, `**VFR_OPENAIP_MASK_LAYER_ID**`) are registered first in `**registerMoonTransitLayers**` (lowest custom z-order) and toggled by `**useMapDisplayMode**` via `**VFR_ONLY_LAYER_IDS**`. The **Layers control** (`**MapDisplayModeLayersControl**`) gains a third card (**VFR Map**, full-width `col-span-2`, `aspect-[8/3]`, green/amber airspace preview); the closed-tile thumbnail cycles `default → atc → vfr → default`. Requires `**NEXT_PUBLIC_OPENAIP_API_KEY**` (free account at openaip.net → profile); layer is silently skipped if unset. Tile URL: `https://{a,b,c}.api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=…`.

- **Map — aircraft model scale inverted** — `buildFlightModelScaleByAltitudeExpression` in `registerMoonTransitLayers` now scales 3D model icons **inversely** with altitude: lower-altitude aircraft (closer to the camera, more dramatic from the ground) appear **larger** on the map (scale ≈28 at ≤1 500 m, ≈20 at 6 000 m, ≈14 at ≥12 000 m), while high-cruise traffic is smaller. Previously high-altitude models were the largest.

- **Map — altitude band filter + legend redesign** — `FlightAltitudeLegend` combines a **band-filter slider** with the altitude gradient bar in a single compact row (slider overlaid on the gradient, transparent track, white circle thumb). Moving the slider filters flights to one of **6 altitude bands** (0–5k ft, 5–15k ft, 15–25k ft, 25–35k ft, 35–45k ft, 45k+) or **All** (index 0, default); `MapContainer.filteredFlights` useMemo applies the `ALTITUDE_BANDS` range via `geoAltitudeMeters`. A brief **auto-hide tooltip** (1.8 s) floats above the legend card on each slider move showing the band's category and ft label. **Altitude color scale** is redefined in `flightAltitudeColor.ts` as 6 discrete ft bands — red `#FF4D4D` (0–5k ft) → orange `#FFA500` (5–15k ft) → yellow `#FFD700` (15–25k ft) → green `#4CAF50` (25–35k ft) → blue `#2196F3` (35–45k ft) → purple `#9C27B0` (45k+) — with the new `ALTITUDE_BANDS` constant (`minMeters` / `maxMeters` / `color` / `category` / `ftLabel`) as the single source of truth shared between the legend, the filter, and the contrail-badge visibility logic. `moon-transit-store` adds `altitudeBandIndex: number` (default `0`) and `setAltitudeBandIndex`. Legend label changed to **Altitude (MSL)** (regular weight, `--fs-body`); default unit is now **ft** (toggle order: ft / km); legend is fixed **`md:w-80`** (320 px) on desktop.

- **Weather — contrail likelihood prediction per aircraft** — New `lib/domain/contrail/contrailService.ts` implements a simplified **Schmidt-Appleman criterion**: maps `baroAltitudeMeters` → ISA pressure (hPa) → nearest fetched pressure level → returns `"none" | "transient" | "persistent"` based on ambient temperature (threshold ≈ −38 °C) and relative humidity w.r.t. ice (RH_ice ≥ 100 % → persistent). `weatherService.ts` now fetches **temperature and relative humidity at 500, 400, 300, 250, 200 hPa** from Open-Meteo in the **same HTTP request** as `cloud_cover` (no extra round-trip). `weather-store.ts` gains `atmosphericLevels: AtmosphericLevel[] | null` and `setAtmosphericLevels`. `useWeatherSync` is updated to call `getWeatherData` (replaces `getCloudCover`) and syncs both fields. `SelectedAircraftPopupContent` shows a **Contrails** row (desktop `dl` + mobile grid card) in the same grid row as Altitude — yellow for transient, orange for persistent, grey dash when data is unavailable. `useMapGeoJsonSync` computes `contrailLikelihood` and `contrailBadgeVisible` (boolean) per flight GeoJSON feature; `contrailBadgeVisible` is `true` only when the altitude band filter is **active** (`altitudeBandIndex > 0`) and the aircraft falls within the selected band. `registerMoonTransitLayers` adds a `flights-contrail-badge` circle layer (`circle-translate: [8, −8]` viewport offset, radius 4, yellow/orange based on `contrailLikelihood`, opacity driven by `contrailBadgeVisible`) that renders on top of the main flight layer.

- **Field — AR sky overlay (MVP)** — Added `ArSkyCameraPanel` in the **Field** card: opens a fullscreen rear-camera view and overlays markers for the **selected flight**, watched flights, top transit candidates, and additional live flights so labels appear while scanning the sky even without manual map selection. Projection is observer-centric azimuth/altitude (`horizontalToPoint`) with live device orientation. Includes heading/pitch smoothing to reduce jitter, edge arrows for off-screen aircraft, a mini radar ring (top-right) for quick relative bearing awareness, quick heading recenter, a runtime toggle (**Show all nearby** vs **Only focused flights**), and click-to-open aircraft cards (tap callsign/arrow marker to load flight details in the upper AR HUD), plus moon marker and fallback permission errors.

- **Map — mobile Layers + altitude row** — On small viewports, `MapContainer` wraps `MapDisplayModeLayersControl` and `FlightAltitudeLegend` in a fixed bottom row (`flex`, `items-stretch`, gap) so the Layers tile and legend share one horizontal band above the shell nav without overlapping; the Layers thumbnail uses flexible height to match the legend (`flex-1` preview). Desktop layout unchanged (`md:contents`). `FlightAltitudeLegend` uses slightly tighter mobile padding; ATC preview rings scale down on the compact tile.

- **Map — display mode “Layers” control** — Replaced the segment control that lived in the altitude legend with a Mapbox-style **Layers** tile (square thumbnail + **Layers** footer) at the **bottom-left** of the map (`MapDisplayModeLayersControl` in `MapContainer`). Open it to choose **3D Model** (internal id `default`, formerly labeled “Default”) or **ATC Style** (`atc`). The **gumb / tile thumbnail shows the other mode** (the one you get if you switch), not the active mode — e.g. on **3D Model** the preview teases **ATC Style**, and vice versa. The **3D Model** card image is `public/images/flight-3d-model-thumb.png` via **`FLIGHT_3D_MODEL_UI_PREVIEW_PATH`** in `mapOverlayConstants.ts` (update the PNG when changing **`FLIGHT_3D_MODEL_URL`** / GLB). **`FlightAltitudeLegend`** now only covers **aircraft color by altitude (MSL)** and **km / ft** ticks (no display-mode switch).

- **Filters — aircraft type options without map click** — `useFlightAircraftTypeIndexPrefetch` (wired from `HomePageClient`) batches lookups from **`openskyAircraftIndexClient`** (`fetchOpenSkyAircraftTypeLabel`) for flights missing `aircraftType` after each snapshot (debounced, limited concurrency), then **`patchFlightAircraftTypeFromIndex`**. The Filter panel’s **aircraft type** multi-select therefore fills with real labels instead of only **N/A** until the user clicks a plane on the map.

- **Filters — shell card search + aircraft-type multi-select** — Replaced map-top search with a dedicated **Filter** shell card (`FlightFiltersPanel`) and a multi-select aircraft-type combobox (portal pattern). **`flightFilterCriteria`** flows from `HomePageClient` → `MapContainer` → `filterFlightsByCriteria` / map GeoJSON. Search/filter logic lives in **`src/lib/flight/flightSearch.ts`**.
- **Map — flight search airline/type fallback labels** — Search now also indexes `flightAirlineDisplayLine` and `flightAircraftTypeDisplayLine`, so queries like **Turkish** match flights whose live feed has only ICAO operator code (e.g. `THY`) but no explicit `airlineName`.

- **Flight labels — SunExpress (SXS)** — Added ICAO **SXS** → **SunExpress** and IATA **XQ** in `flightDisplayLabels.ts` (display name + Kiwi logo mapping).

- **Map — display mode switch (3D Model / ATC Style)** — `mapDisplayMode` in `moon-transit-store` (`default` | `atc`, see `types/map-display.ts`) switches between the Mapbox **`model`** flight layer (same **`FLIGHT_3D_MODEL_URL`** GLB) and **ATC** 2D overlays (dot, labels, leader, prediction) plus a blue screen tint (`useMapDisplayMode`, `registerMoonTransitLayers`). UI copy uses **3D Model** and **ATC Style**. In **ATC Style**, the same **Aircraft color by altitude (MSL)** preference tints the ATC ring (`useMapFlightAltitudeColorsPaint`). Startup default remains **3D Model**.

- **Documentation** — Brought [`architecture.md`](./architecture.md), [`technicalconventions.md`](./technicalconventions.md), [`ui-generator-technical-spec.md`](./ui-generator-technical-spec.md), [`user-guide.md`](./user-guide.md), and [`src/stores/README.md`](../src/stores/README.md) in line with **camera presets** (fixed bodies + **Other**), store **`cameraFrame*`** fields, **`apsC16`**, **`shotFeasibility`** output-frame helpers, **Full frame / Zoom** viewfinder behaviour, and [`.cursorrules`](../.cursorrules) combobox references (`CameraPresetSelect`).

- **Documentation (map / mobile overlays)** — [`architecture.md`](./architecture.md) now documents the **`MapContainer`** mobile **`flex`** row for **`MapDisplayModeLayersControl`** + **`FlightAltitudeLegend`** (`fixed` above tab bar, `items-stretch`, legend `flex-1`, selection hides legend on small screens). [`user-guide.md`](./user-guide.md) step **5c** and the map table describe the same **side-by-side** narrow-layout behaviour.

- **Documentation (map / filters)** — Refreshed [`architecture.md`](./architecture.md) ( **`mapDisplayMode`**, **`MapDisplayModeLayersControl`**, **`FlightFiltersPanel`**, **`useFlightAircraftTypeIndexPrefetch`**, **`FLIGHT_3D_MODEL_UI_PREVIEW_PATH`**, combobox scroll rule reference), [`user-guide.md`](./user-guide.md) (Filter + Layers workflow, dual-mode map table), [`technicalconventions.md`](./technicalconventions.md) (portal `scroll` must check `event.target`; flight-provider E2E: trigger toggles menu — do not re-click between checkbox steps; accurate Playwright test ids for `flight-source.spec.ts`), and [`documentation/README.md`](./README.md) index blurb.

### Fixed

- **Map — flight pick teardown** — `useMapFlightPick` cleanup no longer calls `map.getLayer` (which can throw when the style is torn down during narrow-desktop resize); it always `off`s the click and layer hover handlers instead.

- **E2E — flight source combobox** — `e2e/flight-source.spec.ts` no longer clicks the provider trigger between live-feed checkbox steps. The trigger toggles the menu closed, which unmounts `live-feed-opensky` / `live-feed-adsbone` and caused Playwright to time out waiting for those elements in CI.

- **Shell comboboxes — scroll closes menu** — `window` `scroll` listeners (capture phase) no longer close portaled listboxes when the scroll **`event.target`** is inside the **menu** or **trigger** (`FlightFiltersPanel`, `FlightProviderSelect`, `CameraPresetSelect`, `CameraSensorSelect`). Scrolling a long aircraft-type or option list no longer dismisses the panel.

- **Map — ATC altitude tint first render** — `useMapFlightAltitudeColorsPaint` now keeps an `idle` listener (not one-shot) and reapplies `applyFlightLayerColorPaint` when `mapDisplayMode` changes, so ATC ring altitude colors appear immediately after switching to **ATC Style** without needing to toggle the checkbox off/on.

- **Map — Default flights hidden after ATC switch** — `useMapDisplayMode` now resets default flight-layer filters to an explicit show-all expression (`["has","id"]`) when returning to **Default**, instead of relying on `null` filter clears during async layer/style transitions. This prevents cases where aircraft remained hidden after toggling ATC mode.

- **Map — Default mode showing circles after ATC** — returning to **Default** now calls `ensureFlightLayerWith3dModel` from `useMapDisplayMode`, so the flight layer is re-upgraded from circle fallback to the 3D model layer after ATC transitions.

- **Map — first-load Default circles before 3D** — `useMapDisplayMode` now schedules two short delayed retries of `ensureFlightLayerWith3dModel` in **Default** mode (`~700 ms`, `~1800 ms`) so startup timing races no longer leave the initial view on circle fallback until a manual mode switch.

- **Map — display-mode bootstrap on initial style idle** — `useMapDisplayMode` no longer exits early when the map style is not yet loaded on first render; it now runs the first mode apply on the first `idle`, preventing startup sessions where Default stayed on fallback circles until a manual mode toggle.

- **Map — ATC click/select and photo overlays** — `useMapFlightPick` now picks flights from both default and `atc-flights-dot-layer`, so selected-aircraft card opens in **ATC Style** as well. `useMapDisplayMode` no longer hides selected-aircraft stand / trajectory layers in ATC mode, so moon-photo planning overlays remain available after selecting a flight.

- **Photographer — Viewfinder aircraft orientation** — The aircraft silhouette in `ViewfinderPreview` now rotates by live ADS-B heading (`trackDeg`) and applies a moon-sky correction using the observer/time-specific **parallactic angle**. This keeps the airplane orientation visually aligned with the moon disk tilt in the field viewfinder.

- **Photographer — Viewfinder trajectory guide** — Added a thin yellow predicted trajectory line across the Moon disk in `ViewfinderPreview`, oriented by corrected ADS-B heading and scaled from current ground speed + slant range to estimate short-horizon on-sky motion.

- **Photographer — Viewfinder trajectory styling** — The trajectory guide in `ViewfinderPreview` now uses a thicker dashed yellow stroke and an arrowhead marker to show travel direction at a glance.

- **Photographer — Viewfinder size estimation fallback** — When API aircraft length is missing, `ViewfinderPreview` now estimates size from flight context: 40 m above 9000 m altitude, 12 m for low-and-slow (<3000 m and <300 km/h), otherwise a regional generic fallback from ICAO24 prefix heuristics. UI copy now shows **Size Estimated** instead of `N/A`.

- **Photographer — focal-length framing metrics** — `Shot feasibility` now separates geometry ratio from framing scale: plane-vs-moon percent is labeled as focal-length independent, and the panel adds an estimated full-Moon pixel diameter / frame occupancy for a 6000×4000 reference frame (calibrated from 948 px at 600 mm full-frame).

- **Photographer — Viewfinder 6000×4000 scale toggle** — Added a toggle in `ViewfinderPreview` to switch between normalized moon rendering and sensor-style framing scale (downscaled from 6000×4000 metrics at current effective focal length), so users can preview relative moon/aircraft footprint in practical capture terms. **Full frame** now activates the sensor-scale view; **Zoom** activates the normalized 0.5° comparison scale (previous button wiring was reversed). **Full frame** hides the trajectory line and arrow; they remain in **Zoom** for path/orientation preview.

- **Photographer — camera preset selector** — Added a `Camera preset` combobox (default: **Canon R6 Mk II**, full-frame, 6000×4000) that auto-applies the sensor format and feeds frame-dimension metadata into `ViewfinderPreview` scale labels. Presets are centralized in `src/lib/camera/cameraPresets.ts` for easy manual expansion.

- **Photographer — camera preset Other** — Added an **Other** preset: user-chosen **sensor type** and manual **frame width/height** (px). Fixed presets keep sensor and resolution **read-only** (disabled combobox/inputs). Shot-feasibility framing copy and the viewfinder use the active output dimensions from the store.

- **Photographer — APS-C 1.6× crop** — `CameraSensorType` now includes **`apsC16`** (1.6× effective focal vs full frame, typical Canon APS-C) alongside **`apsC`** (1.5×). The Canon 7D Mk II preset uses `apsC16`. UI labels distinguish **APS-C 1.5×** vs **APS-C 1.6×**.

- **Flights — live motion freeze then jump** — Smoothed live tracking by adding periodic in-place live refresh while the map is idle (`useMoonTransitMap`, every ~12 s for live providers), reducing client/provider/proxy cache windows from ~30 s to ~12 s (`openSkyFlightProvider`, `adsbOneFlightProvider`, `/api/opensky/states`, `/api/adsbone/point`), and extending extrapolation lead/cap (`extrapolateFlightForDisplay`: 40 s lead, 45 s cap). This removes the common “move, stop, then teleport” pattern on static map views.

- **Flights — ADS-B One CORS console spam** — `fetchAdsbOnePointJson` now runs **proxy-only by default** (`/api/adsbone/point`). Browser-direct mirror fallback is disabled unless explicitly enabled with `NEXT_PUBLIC_ADSBONE_ALLOW_DIRECT=1` (debug/special deployments). This prevents repeated browser CORS `403` noise on hosts/origins that `api.adsb.one` does not whitelist.

- **Photographer — Viewfinder moon disk halo** — Removed the light gray SVG underlay circle behind the clipped NASA SVS moon texture so a thin bright ring no longer appears at the circular clip edge (SVS frames include dark sky around the lunar limb).

- **Photographer — Viewfinder aircraft visibility** — Added a permanently visible, center-on-moon aircraft silhouette in `ViewfinderPreview` so relative plane-vs-moon size is always visible even when CSS transit animation fails in some browsers/render paths. Transit animation remains as an additional moving overlay.

- **Map — mobile 3D gestures** — Removed **`touch-pan-x` / `touch-pan-y`** from the narrow-layout map wrapper; restrictive **`touch-action`** could block Mapbox **two-finger** rotate / tilt / pinch. **`NavigationControl`** now uses **`visualizePitch: true`** so the compass reflects tilt.

- **Map — moon NOW + simulated time markers** — Removed vertical **`text-offset`** on **`moon-az-now-label`** / **`moon-path-current-label`**. **`moon-az-now-label`**, **`moon-path-labels`**, and **`moon-path-current-label`** use **`text-pitch-alignment` / `text-rotation-alignment`: `map`**; **`moon-path-current-dot`** uses **`circle-pitch-alignment`: `map`** so pitched maps keep glyphs and the dot on the ground geometry. The **moon path** `LineString` stays **rise→set samples only** (no extra vertex for the simulated instant): inserting that point had drawn **chords across the arc** when scrubbing the timeline. The **simulated-time dot + label** remain on the true azimuth via **`moon-path-current-geo`**.

- **Map — selected aircraft card — refresh samo na mobilnom** — Gumb **Refresh flight data** na kartici je **`md:hidden`**: na širokom layoutu nije postojao, a u retku s **Aircraft type** lako se vizualno preklapa; desktop i dalje može osvježiti letove pomicanjem karte / **Flight source** panelom.

- **Map — selected aircraft popup vs desktop time toolbar** — Donji rub vremenskog reda i gornji rub karte ponekad se vizualno podudare; bez eksplicitnog **z-index** cijeli je stupac karte ispod reda s **Sync** ikonom (ista SVG kao refresh na kartici). Desktop: omotač **`TimeAndWeatherBlock`** **`z-10`**, stupac karte **`z-20`**; **`moon-transit-aircraft-popup`** na desktopu **`z-index: 35`** (mobilni `@media (max-width: 767px)` i dalje **100**).

- **Map — selected aircraft card dock (mobile tune)** — Bez **`max(padding, navH)`** (dvostruko brojanje). Sidrište **0px** od dna canvasa; lift **`1 + 0.02·padding`** (cap **20px**) + **`0.35·(nav−padding)`** kad je nav **> padding + 8px**; **`setOffset`** Y = **`-lift + 14px`** (`**MOBILE_POPUP_DOCK_DOWN_NUDGE_PX**`) — mali pozitivan pomak prema dolje da kartica dotakne tab traku. **`readMobileDockPaddingBottomPx`** ne forsira min **120px** kad je padding ≥ **48px**.

- **Map — selected aircraft popup offset (mobile root cause)** — Mapbox **`Popup` offset**: *negative Y = up*, *positive = down*. Kod je slao **pozitivan** `setOffset` uz `anchor: 'bottom'`, pa je kartica zrakoplova bila gurnuta **prema dolje** ispod donje navigacije. Sada se koristi **negativan Y** (`-mobileBottomPopupLiftMagnitudePx`).

- **UI — mobile bottom sheet (peek)** — Uklonjen **`min-h-[42dvh]`** na cijelom panelu; u stanju **peek** sheet je **`h-fit max-h-[42dvh]`** s **`flex flex-col`**, a tabpanel **`max-h-[calc(42dvh-3.25rem)]`** umjesto fiksnog **`h-[calc(100%-3rem)]`**, da nema velikog praznog prostora kad je malo sadržaja. Donji **`bottom`** pomaknut na **`4.25rem + safe-area`** da se panel ne preklapa s tab trakom.

- **UI — mobile LunaPic chip vs map (Safari / narrow)** — Kompaktni gornji red (`AppHeaderBrand`) bio je **`z-40`**, a map stupac **`z-[70]`**, pa je logo nakon učitavanja karte ostajao **ispod** mape (čini se „blink“ pa nestane). Chip sada **`z-[78]`** (ispod bottom sheeta **`z-[75]`**).

- **Map — altitude legend vs mobile tab bar** — Legenda je na uskim ekranima **`fixed`** s **`bottom: calc(4.35rem + safe-area)`** i **`z-[72]`** kako ne bi završila ispod donje navigacije (ranije `absolute bottom-3` unutar karte).

- **Map — mobile selected-flight card vs tab bar (regression)** — Bottom popup **`setOffset`** now keys off **`max(padding read, measured mobile nav height + 32px)`** plus a larger fixed lift (**72px**) and a higher screen anchor (**120px** above map bottom), so the card clears tall tab rows and safe-area padding. Aircraft popup **`z-index`** on small viewports raised to **100**. Card adds **`env(safe-area-inset-bottom)`** padding for the last stats row.

- **Map — selected aircraft card vs bottom tabs (mobile)** — The map column wrapper uses **`z-[70]`** with **`pointer-events-none`**, and **`MapContainer`** `map-surface` uses **`pointer-events-auto`** + **`overflow-visible`**, so Mapbox popups paint **above** the tab bar (`z-[60]`) while taps reach tabs through the reserved bottom padding. Bottom sheet **`z-[75]`**. **`SelectedAircraftMapPopup`**: higher bottom anchor, larger base lift, **`data-testid="mobile-primary-nav"`** + measured nav height so **`setOffset`** gains extra px whenever the tab bar is taller than the map dock **`padding-bottom`** reserve.

- **Map — selected aircraft vs mobile shell sheet** — `**suppressSelectedAircraftPopup`** kad je `**mobilePanelId**`; teardown u `**useEffect**` + `**destroyAircraftPopupNow**`: `**root.unmount()` / `popup.remove()**` u `**queueMicrotask**` (listeneri `map.off` odmah) da nema *synchronously unmount a root while React was already rendering*. Odabir u storeu ostaje. `**dynamic<MapContainerProps>*`* u `**HomePageClient**`.
- **UI — mobile shell tabs** — Selected tab uses `**ring-inset`** (outer `ring` was clipped by the tab row’s horizontal scroll `overflow-*` pairing). **Pulse** no longer uses `**scale-[1.03]`** (transform overflow); short `**brightness-110**` flash instead. Tabs `**min-h-[3.5rem]**`, `**py-2**` on buttons, `**py-1.5**` on scroller; icon in `**leading-none**` span.
- **Map — selected aircraft card (mobile)** — Anchor `**y ≈ rect.height − 96px**`; `**setOffset**` = padding read (min **120px**) + **56px** + dodatak ako je **`mobile-primary-nav`** viši od tog paddinga. Širina: `**setMaxWidth`** + inline `**width`/`max-width**` na Mapbox rootu = `**max(visualViewport, innerWidth, documentElement.clientWidth, map clientWidth)**` (suženi browser / devtools). CSS + shell `**z-[70]**` map column (vidi Fixed iznad). `**mapboxgl-popup-content > ***` `**width: 100%**`, legend `**max-md:hidden**` kad je odabir. Kartica `**max-md:border-x-0**`, `**max-h**` `**min(52dvh, 24rem)**`.
- **UI — mobile bottom nav** — Veći `**pt` / `pb`** (uklj. safe area), `**py**` na tab listi i `**py-2**` na gumbima da ikone ne diraju donji rub ekrana. Bottom sheet `**bottom**` pomaknut na `**3.55rem**` da ostane iznad deblje trake.
- **Map — moon × static route intersection markers** — Yellow `**moon-intersections`** points are only built when `**ENABLE_STATIC_ROUTE_MAP_OVERLAY**` is on (same gate as the violet `routes.json` polylines). With the overlay off, `**useMapMoonOverlayFeatures**` now returns an empty intersection list so stray demo-route dots no longer sit on the live map. `routes.json` remains in use for OpenSky hull / domain math.
- **Moon (nowcast) — altitude visibility dot** — The tier indicator next to **Altitude** again uses **red** (`critical`, e.g. below horizon), **amber** (`caution`, 5–12°), and **emerald** (`optimal`, ≥ 12°). A prior styling pass had mapped `critical`/`optimal` to yellow/blue so the dot no longer matched field-visibility meaning.

### Changed

- **Map — selected aircraft card — header layout** — Header is **logo + airline + callsign** only (full width for names, **`break-words` / `break-all`**); the airline block is **`items-center`** with the logo so text is **vertically centered** to the logo tile. **Aircraft type** and **ICAO24** use the **same row style and typography** as Position / Altitude in the desktop **`dl`**, and the same **tile pattern** as the other rows in the mobile grid (no narrow column under the logo).

- **Map — selected aircraft card — Aircraft type / ICAO24** — When **`aircraftType`** or **`icao24`** is missing or blank, the row shows **`N/A`** (English) instead of emitter-category text, “Type not reported”, or “ICAO24 not reported”; applies to all flight sources.

- **Map — altitude legend — km / ft placement** — **`FlightAltitudeLegend`**: the **km** / **ft** segmented control sits on the **same row** as the altitude-colors checkbox and **Aircraft color by altitude (MSL)** title (`flex`, **`gap-3`** between title block and units, **`shrink-0`** on the control); the gradient bar and mono tick row stay below. **About** FAQ (*What does the altitude color bar on the map mean?*) updated for the same behaviour.

- **Map — selected aircraft card — Clear placement** — **Clear** moved to the **bottom** of the card, **to the right** of **State time** (desktop `dl` row and mobile footer strip). The header on narrow screens keeps only **Refresh**.

- **Map — selected aircraft card — refresh flights** — A **Refresh flight data** icon button on the card (header on mobile) calls **`refreshFlightsNow`** from **`useMoonTransitMap`** (same bounds fetch as map moves, **without** the live-feed debounce), so field users can pull the latest OpenSky/ADS-B snapshot without reloading the PWA.

- **Map — selected aircraft card** — Header matches a **three-column** strip: **square logo** (Kiwi `64x64` when mapped; dashed placeholder otherwise), **airline + call sign** (stacked, yellow bold callsign), then **Aircraft type** / **ICAO24** each on its own row (small uppercase mono label + value). Desktop **`dl`** / mobile tiles remain **flight-only** (position, altitude, ground speed, track, state time).
- **CI — GitHub Actions** — `actions/checkout@v5` and `actions/setup-node@v5`; workflow Node **22** (LTS) instead of 20, addressing the Node 20 action-runtime deprecation annotation on `ubuntu-latest`.
- **UI — mobile bottom tabs (per card)** — Below `md`, the bottom bar is a **horizontally scrollable tab list** (≈**five** tab widths visible at once via `min-width: calc((100vw - padding) / 5)`), one tab per main **Shell** card, each with the same **SVG icon** as the matching shell section (`sectionCategoryIcons`), `**text-xs`** labels, and **edge fades + a right chevron** when more tabs lie off-screen (scroll + `ResizeObserver`). Tapping opens the bottom sheet for that panel. `**useLayoutEffect`** scrolls the active tab toward center; `data-testid="mobile-shell-tab-<id>"`.
- **UI — transit candidates** — Removed the tiny footnote under **Transit candidates** (“Notify me on watched flights…”). Bell buttons keep `**aria-label`** / `**title**` for alerts and permission context.
- **Shell — sidebar footnote** — Removed `**SidebarSyncFooter`** (the dashed “Fixed observer… routes.json… provider…” note under Active transits). Behaviour is unchanged; details remain in About / architecture.
- **Map — altitude color scale** — Aircraft tint by `**altitudeMeters`** is now **light green (low) → green → blue → dark blue (~12 km)** instead of grey→rainbow→red; legend stops match. **Shot-feasible** override stays `**#22c55e`**.
- **Map — altitude legend readability** — Larger type (`text-sm` / `text-base` title, `text-xs`–`text-sm` mono ticks), taller gradient bar, wider padding; tick labels shortened to `**0m` / `2k` / `4.5k`** style so they stay on one line. `**shellAccentCheckboxClass**` uses `**h-4 w-4**` for a clearer control.
- **Map — altitude legend copy** — `**FlightAltitudeLegend`**: the **toggle** sits **before** the title **Aircraft color by altitude (MSL)** on one row (no separate **Color by altitude** line); tighter `**gap`** / `**py**` on small screens. Long footnotes stay in About FAQ. Checkbox `**aria-label**` unchanged (`data-testid="flight-altitude-colors-toggle"`).
- **UI — shell combobox + map legend styling** — `**shellComboboxStyles.ts`** centralises trigger, portal listbox, glass panel, and accent checkbox classes. `**FlightProviderSelect**` now matches `**CameraSensorSelect**` (`h-9` trigger, same portal panel + width/clamp behaviour, **blue** checkbox accent vs sky). `**FlightAltitudeLegend`** uses the same **glass panel** and `**shellAccentCheckboxClass`** as the shell pickers.
- **Flights — Flight source combobox** — Menu is **OpenSky** + **ADS-B One** checkboxes only (`FLIGHT_PROVIDER_COMBO_IDS`). **Mock** and **Routes (static)** are not listed. `**ensureFlightSourceComboboxMode`** migrates a lingering `**static**` session to live dual fetch. `mock` / `StaticFlightProvider` remain for tests and `routes.json` domain geometry (OpenSky hull, moon–route math).
- **Flights — default live feeds** — `liveFlightFeeds` now starts with **both** OpenSky and ADS-B One enabled (`{ opensky: true, adsbone: true }`); the combobox trigger shows **OpenSky + ADS-B One (merged)** until the user narrows sources.
- **Map — static route polylines** — The violet `**routes-geo`** / `routes-line` overlay from `routes.json` is **off** by default (`ENABLE_STATIC_ROUTE_MAP_OVERLAY = false` in `staticRouteUtils.ts`): those lines were **demo corridor geometry**, not real ADS-B history. Domain logic (OpenSky bbox hull, moon–route intersections) still uses `routes.json`; flip the flag when real historic route polylines are available.

### Added

- **Photographer — Viewfinder preview** — `ViewfinderPreview` in `PhotographerToolsPanel`: 3:2 black sensor frame; moon disc fixed at **948 px** for **0.5°** with texture from NASA/GSFC SVS **Moon Phase and Libration** hourly JPEGs (730×730, north up) via `nasaMoonPhaseFrameJpgUrl` / `referenceEpochMs` (`src/lib/domain/astro/nasaMoonPhaseFrame.ts`). Catalog **2023–2026** (8784 frames for leap **2024**); other years snap to that range preserving UT date/time where valid; load failure → bundled static moon. Aircraft silhouette + scale from **0.5° = 948 px**; transit animation uses `transitDurationMs`.

- **Flights — OpenSky aircraft type by ICAO24** — Build step `**npm run data:opensky-aircraft**` downloads OpenSky’s aircraft metadata CSV and writes sharded JSON under `**public/data/opensky-aircraft/**` (three hex prefix per file so each shard stays small and `**JSON.parse**` does not freeze the UI). Each entry stores `**typecode**`, `**model**`, and `**manufacturername**`; the UI prefers **manufacturer + model** when both exist (avoids duplicating the manufacturer if the model string already starts with it), otherwise **model**, then manufacturer, then typecode. Selecting an aircraft fetches the matching shard (with a **20 s** fetch budget) and patches `**aircraftType**` into the store when live feeds omit it.

- **Map — altitude legend units** — **`FlightAltitudeLegend`**: segmented **km** / **ft** control (`data-testid="flight-altitude-legend-unit-km"` / `**-ft**`, `data-value`) on the **title row** switches tick labels only (MSL scale unchanged); state **`flightAltitudeLegendUnit`** in **`moon-transit-store`**. Ft labels use compact **thousands of feet** (`6.6k`, `39.4k+`, …) via **`flightAltitudeLegendStopLabel`** in **`flightAltitudeColor.ts`**.
- **Chrome — logo refresh** — Tapping the **header logo** runs `**location.reload()`** (hard refresh), mainly for **Add to Home Screen** / in-app WebView where the browser refresh control is missing. `**aria-label` / `title`**: “Refresh page”; `**data-testid="header-logo-refresh"**`.
- **Map — altitude colors toggle** — `**FlightAltitudeLegend`** includes a **Color by altitude** checkbox (`data-testid="flight-altitude-colors-toggle"`). When off, `**mapAircraftAltitudeColors`** in `moon-transit-store` drives `**applyFlightLayerColorPaint**`: markers use a **single neutral tone** (`#94a3b8`); **shot-feasible** stays **green**. `**useMapFlightAltitudeColorsPaint`** reapplies paint after the async **3D model** swap (`idle`). Default: on (full altitude scale).
- **Map — altitude color + legend** — Aircraft **3D model** and **circle** fallback use `**flightFeatureColorMapboxExpression`** (`flightAltitudeColor.ts`): interpolate by `**altitudeMeters**` (~12 km MSL; **light green → dark blue** scale; **shot-feasible** stays `**#22c55e`**). `**FlightAltitudeLegend**` on the map bottom documents the scale (English).
- **Flights — dual live feeds** — In the **Flight source** combobox menu, **OpenSky** and **ADS-B One** rows use **checkboxes** only (no static/mock rows). Same **ICAO24** is **one map aircraft**: `**mergeLiveFlightLists`** (newer `timestamp` wins; sticky metadata). Merged mode shows **OpenSky + ADS-B One (merged)** on the trigger. `loadFlightsInBounds` uses `Promise.allSettled`; map debounce is slightly longer when both feeds are on.
- **Flights — ADS-B One** — Provider id `adsbone`: `AdsbOneFlightProvider` + `parseAdsbOnePoint.ts`; same query geometry as OpenSky (`openSkyStyleQueryRegion.ts`). **Fetch:** browser-first **mirrors** `api.adsb.one` then `api.airplanes.live` (same `/v2/point/…` shape; second host often survives when Cloudflare blocks datacenter IPs), then same-origin `GET /api/adsbone/point` (tries both upstreams). Optional `NEXT_PUBLIC_ADSBONE_DISABLE_DIRECT=1` in `.env.local.example`.
- **Photographer — field sounds** — With **Sounds on** and a selected aircraft, `useTransitFieldSounds` in `MapContainer` plays a short **chime** when that aircraft enters the **green** (shot-feasible) map set, and a **soft sustained tone** while it stays in the **moon-overlap** disc model (`screenTransitCandidates`); existing **countdown beeps** (≈3 s before alignment and at alignment) still use `useTransitBeep`. Shared short tones live in `src/lib/audio/fieldAudio.ts`; green-set logic is `computeShotFeasibleFlightIds` in `src/lib/domain/transit/computeShotFeasibleFlightIds.ts`.
- **Moon (nowcast) — “Ideal for transit watch”** — When the observer is still the **default balcony** point and the simulated moon matches a saved reference band (altitude, azimuth, near-full illumination, apparent radius), the panel shows a yellow **Ideal for transit watch** callout (English) as a cue for waiting on a moon crossing with a clear sight line. Logic lives in `src/lib/domain/astro/balconyTransitWatchIdeal.ts`.
- **Moon (nowcast) — field note** — When the Moon is above the horizon, **Copy field note** copies a plain-text block (English) to the clipboard: simulation instant (UTC + local), observer WGS84, **ground elevation (m)**, altitude/azimuth/angular radius/illumination, moonrise/moonset lines, and field visibility advice — for balcony or stand shot logs.
- **Moon (nowcast)** — **Illuminated** row shows disk lit percentage (Suncalc `fraction`, 0–100%) next to altitude/azimuth; `MoonState` now includes `illuminationFraction` alongside phase.

### Fixed

- **Flights — OpenSky ground traffic** — `flightsFromOpenSkyResponse` no longer skips states with `**on_ground`** set, so aircraft **on the apron / taxi / runway** (e.g. near Zagreb) can appear when OpenSky returns them. Velocity stats (`averageVelocityMpsInRegion`) still ignore on-ground rows for sensible speed averages.
- **Flights — dual live duplicate markers** — OpenSky kept ICAO24 casing from the API while ADS-B One used uppercase `hex`, so the same aircraft produced **two** `FlightState.id` values and **two** map symbols. Both parsers and `**mergeLiveFlightLists`** now use `**canonicalIcao24Id**` (trim + lowercase).
- **Shell — desktop header / rails** — Logo column uses `md:self-center` + `flex items-center` so it vertically centers against the taller time/weather chrome; `TimeAndWeatherBlock` uses `sm:items-center` so clouds, toolbar, and slider share a common vertical alignment; safe-area top padding matches both chrome rows; side rails use `pt-0` with horizontal/bottom padding so the first panel lines up with the map column top.
- **Shell — page background** — Explicit black on `html` + solid black underlay on `body` so the viewport no longer shows a light grey “canvas” gutter outside the `mt-app-bg` gradients; `main` uses `min-h-dvh` + transparent fill.
- **Field sounds on iOS Safari** — Web Audio from `useEffect` alone was silent; `**resumeSharedAudioFromUserGesture`** runs on **Sync** / toolbar taps (no extra sound), `**primeFieldAudioFromUserGesture`** on **Sounds on** plays a short unlock ping and reuses one **shared `AudioContext`** for chimes, hold tone, and countdown beeps. Photographer panel copy explains silent switch + ping.
- **Map — 3D flight markers during zoom** — `model-scale` zoom compensation no longer calls `setPaintProperty` on every raw Mapbox `zoom` event (could flood the main thread during pinch/scroll zoom and make aircraft motion appear to stall until the gesture ended). Updates are coalesced with `requestAnimationFrame` and a final apply runs on `zoomend`.
- **Photographer tools — focal length input** — `PhotographerToolsPanel` no longer syncs the focal text field in a `useEffect` when the store value changes. A **draft string only while the input is focused** keeps the field aligned with `cameraFocalLengthMm` when unfocused without `setState` inside an effect, satisfying `react-hooks/set-state-in-effect` and restoring a clean full-tree `**npm run lint`**.
- **Observer ground height on map** — Mapbox raster DEM + `queryTerrainElevation` fills `groundHeightMeters` after placing the observer from the map center, dragging the marker, and on first layer registration (default location included). The Observer panel label now reflects terrain vs GPS sources instead of implying strict ellipsoid height everywhere. When **GPS omits altitude** (common in browsers), a store nonce triggers the same terrain sample once the map style is ready so the first fix is not stuck at 0 m until the marker is moved.

### Documentation

- **About — manual observer vs GPS** — FAQ *How does the Observer point behave?* notes that the observer can be set manually (coordinates, draggable map marker, **Set my location here**) because consumer GPS often has several metres of error when you need a precise stand or tripod point.
- **Time handling** — `.cursorrules`, `architecture.md`, `user-guide.md`, `optimization-and-refactoring.md`, and `src/stores/README.md` aligned with the **forward-from-Sync (~24 h)** time slider, `getTimeSliderWindowMs` semantics, and `**ephemerisRefetchKey`** bumps on **UTC calendar day** change while scrubbing.
- **Tests — `getTimeSliderWindowMs`** — `astroService.test.ts` covers the forward civil-day window from a positive anchor and the fallback when the anchor is unset.
- **Observer ground elevation** — `architecture.md` (Map bullet + `useObserverStore` table and `**groundHeightMeters`** subsection), `user-guide.md` (step 1), and `src/stores/README.md` aligned with Mapbox DEM, `terrainGroundHeightSyncNonce`, and GPS altitude behavior.
- **Technical conventions — combobox pattern** — Documented mandatory shell dropdown styling (portal listbox, sky glass, `data-testid`/`data-value`, no native `<select>` in sidebar); `.cursorrules` UI section cross-links to `technicalconventions.md`.
- **Flight data vs other trackers** — `documentation/architecture.md`, `documentation/user-guide.md`, About (*What does Flight source control?*), and root `README.md` now state explicitly that live traffic is **OpenSky-only**; FlightRadar24, ADSB-One, and similar feeds use **different** networks/rules, so missing or extra aircraft vs those apps is expected.
- **Architecture / user guide — map pitch** — `architecture.md` / `user-guide.md` aligned with default **0° pitch** on load, `**pitchWithRotate` true** (stock right-drag tilt/rotate), no Shift gesture; Field vs Photographer camera placement note kept in sync.

### Changed

- **Default observer** — Built-in stand-in observer is the balcony point **45.82968°N, 16.06368°E** with **130 m** ground elevation (`DEFAULT_OBSERVER_LOCATION`); map default center follows the same coordinates.
- **Moon (nowcast)** — Each ephemeris row label has a small **yellow** inline SVG icon (altitude, azimuth, angular radius, illuminated fraction, moonrise, moonset) so the block reads less like raw telemetry.
- **Observer panel** — Removed the footnote explaining Mapbox DEM vs GPS altitude for ground elevation; behaviour is unchanged (`GroundObserver` / docs still describe sources).
- **Selected aircraft card** — Removed the cyan-band / zero-offset map legend from the map popup (desktop and mobile). The same explanation now lives in **About** under *What is the cyan band and pale center line when an aircraft is selected?*
- **UI — theme** — Restrained **black / zinc / blue / yellow** palette across shell, panels, comboboxes, map chrome, and `globals.css`: zinc borders and surfaces, **blue-500** for primary focus and selection, **yellow-400** for key telemetry and highlights, **JetBrains Mono** for section labels. Alignment flash uses a soft yellow wash. (Earlier tactical red/orange pass removed as too busy.)
- **Time slider — forward from Sync (~24 h)** — **Sync** sets the left edge of the slider to wall-clock **now**; you scrub **forward** up to a **civil day** (~24 h), matching “now → next full rotation” planning. `**getTimeSliderWindowMs`** is `[timeAnchorMs, timeAnchorMs + 24h)`; `**ephemerisRefetchKey**` also bumps when scrubbing crosses a **UTC calendar day** so moonrise/moonset stay aligned. Replaces the previous **full UTC calendar day** (00:00–24:00) slider window.
- **Map — default 2D pitch** — `defaultMapViewState.pitch` remains **0** (plan view on load). Custom Shift-drag pitch removed; `pitchWithRotate` is **true** again so Mapbox **right-button** rotate/tilt matches stock behaviour alongside nav pitch ± and touch pitch.
- **UI — sensor type combobox** — Replaced native `<select>` with `CameraSensorSelect` (same portal listbox + sky glass pattern as `FlightProviderSelect`); `data-testid="camera-sensor-select"` / `data-value` for parity with provider E2E hooks.
- **UI — camera settings location** — Focal length, sensor type, and effective focal readout moved from `FieldOverlaysSection` to `PhotographerToolsPanel` (same store wiring); Field card now starts with OpenSky latency skew.
- **About — Photographer timing** — Moved the Photographer tools intro (slider time for moon, forward guess for plane from feed) from the panel into a new FAQ entry; About links were later removed from Photographer and Compass cards for a cleaner shell.
- **UI — Flight source panel declutter** — Removed explanatory OpenSky text, anonymous-limit warning, and route-corridor average-speed diagnostics from `FlightSourcePanel` on the home screen so the section keeps only the provider dropdown; operational details remain for About/docs context.
- **UI — Observer panel declutter** — Removed explanatory fixed-observer and first-open GPS auto-request copy from `ObserverLocationPanel` on the home screen to keep the section focused on coordinates and GPS action controls.
- **About — moved panel explanations** — Added FAQ entries for `Flight source` and `Observer` details (OpenSky/static behavior, anonymous rate-limit note, route-region speed diagnostics, fixed observer math anchor, and first-open GPS permission prompt) so operational guidance remains documented outside the main planner UI.
- **Field — Compass → Moon copy** — `CompassAimPanel` keeps the interactive rose + needle only; full Goal / Sensors / Field use / Limits text lives in About FAQ. Rotating compass rose (30° ticks, cardinals + intercardinals), fixed 12 o'clock triangle, link to About from the card.
- **Map — aircraft markers (3D)** — Flight markers use a Mapbox `**model`** layer with a placeholder airplane model (`FLIGHT_3D_MODEL_URL`, `airplane.glb` from Mapbox example), `map.addModel` + layout `model-id`. Paint: `model-rotation` Z from ADS-B `**track`**, `model-translation` altitude from `**altitudeMeters**`, `model-scale` interpolated from altitude (no zoom-driven expression), `model-color` / `model-color-mix-intensity` for green (`isShotFeasible`) vs sky blue. The previous SVG `symbol` path and `FLIGHT_PLANE_ICON_*` constants were removed; circle fallback remains if setup throws.
- **Map — aircraft markers keep readable size while zooming** — Added runtime zoom compensation for flight `model-scale` (`setPaintProperty` on `zoom`) so 3D aircraft stay approximately the same screen size across zoom levels instead of becoming tiny when zoomed out.
- **Map — aircraft model orientation + far-zoom readability tweak** — Increased zoom-compensation ceiling and base model scale so aircraft remain legible at wide-area zoom levels, plus added a yaw offset to align the airplane nose with ADS-B heading (`track`) instead of side-facing drift.
- **Map — aircraft far-zoom sizing rebalance** — Raised reference zoom and minimum compensation factor for model scale so aircraft keep a practical average size even on very wide zoom-outs.

### Documentation

- **Flights / OpenSky / mobile** — Synced `**documentation/architecture.md`**, `**documentation/user-guide.md`**, `**documentation/optimization-and-refactoring.md**`, `**documentation/technicalconventions.md**`, `**documentation/performance.md**`, `**documentation/refactor-roadmap.md**`, root `**README.md**`, `**src/stores/README.md**`, and the Flight source panel copy for: default provider `**opensky**`, combobox order, **fetch vs client filter** (observer disk + map union), `**mergeFlightsWithOpenSkyRetention`**, GeoJSON **throttle** + extrapolation **tick**, `useMoonTransitMap` **debounce** and **observer refetch**, and E2E combobox wording in technical conventions.
- **Architecture / user guide / refactor notes** — Updated `documentation/architecture.md`, `documentation/user-guide.md`, `documentation/optimization-and-refactoring.md`, and `src/stores/README.md` for the full **UTC-day** time slider, **moon path** overlays (visible arc + full-day guide + simulated-instant marker + **NOW** pointer), selected-flight **trajectory**, and the **lunar-day** note (why 00:00 and 24:00 on the slider are not the same moon direction). Workspace `.cursorrules` time-handling line aligned with the same behaviour.
- **About + map semantics alignment** — Updated `src/app/about/page.tsx`, `documentation/architecture.md`, and `documentation/user-guide.md` to align terminology with observer-centric planning: **Transit opportunity corridor** (LOW/MEDIUM/HIGH confidence + 3D volume, shown only in Optimal moon visibility) and explicit note that corridor confidence is a planning filter, while per-flight confirmation still comes from live candidates/feasibility.

### Added

- **About — FAQ search** — The About page includes a search field that matches question and answer text for every FAQ (including collapsed answers) and the Pro Tip card, filters to matching sections, expands matches automatically, and highlights query hits.
- **Observer — manual drag correction on map** — The observer camera marker is now draggable on the map when observer lock is off, so users can fine-tune GPS offset by dropping the observer on an exact ground point. Dragging writes the new WGS84 `lat`/`lng` into `useObserverStore`; when lock is on, dragging is disabled.
- **Map — observer-centric transit opportunity corridor + confidence bands** — Added a continuously refreshed green **transit opportunity corridor** overlay with nested confidence bands (**LOW / MEDIUM / HIGH**) and matching 3D extrusion volumes. It marks where transit capture odds are strongest for the current observer, moon azimuth/altitude, and camera setup (focal length + sensor crop), updates with simulated time as the moon moves, and is shown only when moon field visibility is **Optimal**.
- **Map — 3D perspective and volumetric stand corridor** — Map default pitch is now enabled for an oblique field-planning view, selected flight trajectory carries altitude (`zOffsetMeters`) for 3D line rendering, and the blue stand corridor now includes a semi-transparent 3D volume (`fill-extrusion`) that links observer direction toward the moon/stand geometry instead of only a flat trapezoid.
- **Optical feasibility engine and visual map filtering** — Added camera settings (`Focal length`, `Sensor type`) in Field controls, new domain module `shotFeasibility.ts` with angular-size and moon-coverage formulas, and shot-feasibility rating in Photographer tools (`EXCELLENT` / `FAIR` / `POOR`). Flight markers now carry an `isShotFeasible` property and render with green-vs-blue map icon variants when overlap + optical-range conditions are met.
- **Moon — field visibility advice** — `Moon (nowcast)` shows a **coloured dot** next to **Altitude** and a **Visibility advice** block from `moonFieldVisibilityAdvice` (`lib/domain/astro/moonFieldVisibilityAdvice.ts`): **Critical / Hidden** (red, alt < 5°), **Caution / Low** (orange, 5–12°), **Optimal** (green, ≥ 12°), with short English hints so users do not plan transits when the moon is only barely above the mathematical horizon.
- **iOS — Add to Home Screen prompt** — On iPhone/iPad Safari when not already running as an installed web app (`display-mode: standalone` / `navigator.standalone`), a dismissible English dialog explains **Share → Add to Home Screen**, with **Remind me in 7 days** (snoozes via `localStorage`) and **Don’t show again**. It only appears on `https`, after a short delay.

### Changed

- **Flights / OpenSky — smoother mobile tracking** — Client filter bbox is always the **union of map viewport and the observer ~100 km disk** (not map-only inside the demo hull), so aircraft are not dropped at the edge on every slight pan. `**mergeFlightsWithOpenSkyRetention`** keeps aircraft for up to **~32 s** after they disappear from the latest payload (OpenSky gaps / filter flicker) if they still project inside a slightly padded map bounds; retention state clears when switching flight provider. **Map GeoJSON** for flight symbols is **throttled to ~300 ms** (immediate flush on selection change), and extrapolation **wall-clock tick** is **400 ms** to reduce full `setData` churn on iOS Safari.
- **Flights — default provider** — `useMoonTransitStore` now starts with `**opensky`** (ADS-B) instead of static routes; `FLIGHT_PROVIDER_IDS` order is **OpenSky → static → mock** so the combobox lists the live source first.
- **UI — mobile-first navigation shell** — Mobile layout now prioritizes a near full-screen map with a persistent bottom app navigation (`Mission`, `Time`, `Observer`, `Field`) and a native-style bottom-sheet control surface. Top chrome on phones is reduced to a compact brand chip so map space stays dominant, while mission/time/observer/field controls are opened contextually from tabs instead of occupying fixed map height.
- **UI — mobile polish interactions** — Added app-like tab icons, larger touch targets in the bottom navigation, and multi-snap bottom sheet behavior (`peek`, `half`, `full`) with swipe gestures. Users can drag down to collapse/close the sheet, drag up to expand it, and tap the grab handle to cycle sheet heights for one-handed field use.
- **UI — haptic-like motion polish** — Mobile controls now include subtle press feedback (`active` scale) on bottom tabs and grab handle, plus spring-like bottom-sheet snap transitions (custom cubic-bezier) to mimic native haptic rhythm while preserving reduced-motion accessibility.
- **UI — active-tab selection pulse** — Added a short one-shot pulse on tab activation so switching between `Mission`, `Time`, `Observer`, and `Field` gives immediate tactile visual confirmation without persistent motion.
- **Map — selected aircraft popup mobile collision fix** — The selected-aircraft popup now docks on mobile with `bottom` anchoring (horizontally centered) so a near full-width card sits just above the bottom tab bar (Flightradar-style), uses map-container pixel math, listens to `resize` for reposition, and keeps a bounded card height with internal scroll. The mobile card uses `100dvw` minus safe-area insets for edge-to-edge width with rounded top corners only.
- **UI — compact mobile selected-aircraft card** — Mobile selection card is redesigned for a much shorter footprint (capped height ~`14.5rem`/`32dvh`): call sign + airline header, a tight 2×2 stat grid (altitude, speed, track, position), slim type/ICAO24 footer, and the long cyan-band legend moved behind a collapsed` Map legend ```` block. Desktop keeps the full legend + definition list layout.`
- **Transit candidates — watch + browser alert** — Candidate rows now include a per-flight watch toggle (`🔔` / `🔕`). When a watched flight enters the active alignment window, the app emits a browser notification (“LunaPic candidate update”). Watch state persists in `localStorage`, a short cooldown suppresses repeat spam, and the panel hints when browser notification permission is still pending.
- **Transit candidates — watch UI reliability** — Notification capability + watched IDs now sync after client hydration (SSR had no `Notification`, which could leave iOS stuck showing “unsupported”), the first `localStorage` persist pass is skipped to avoid wiping saved watches, and the watch control uses SVG + larger mobile touch targets instead of emoji-only glyphs.
- **Flights / OpenSky — observer outside static corridor** — When the observer sits outside the demo `routes.json` hull (e.g. relocated to Amsterdam), the OpenSky query box now falls back to the bounded ~200 km disk around the observer instead of intersecting the hull with the previous map viewport (which could keep traffic tied to Croatia). Parsed states are filtered with the union of map bounds and that disk so aircraft appear after GPS moves before the map finishes panning. `useMoonTransitMap` also refetches flights when observer `lat`/`lng` changes.
- **Map — selected aircraft short-term trajectory** — Clicking an aircraft now keeps selection behavior and adds a short projected path overlay (about 90 s ahead) derived from the selected flight’s current extrapolated position, `groundSpeedMps`, and `trackDeg`. The trajectory is rendered as a high-contrast amber dashed line (`selected-flight-trajectory-geo`) with an endpoint label (`+90s` via `selected-flight-trajectory-label-geo`) and hides automatically when speed/track are unavailable.
- **Map — real-time moon pointer (`NOW`)** — Added a second moon-azimuth overlay tied to wall-clock time (`Date.now()`), independent of simulated slider time. The new cyan dashed line (`moon-azimuth-now-geo`) refreshes every second and now includes a `NOW` endpoint label (`moon-azimuth-now-label-geo`) so users can always identify the live direction pointer.
- **Map — full moon path (light guide)** — The moonrise→moonset path remains primary, and a new low-contrast full-day path (`moon-path-full-day-geo`) is now rendered in the background to provide a complete lunar direction guide for the whole UTC day.
- **Time slider — full-day window** — Time controls now run across the full UTC day (00:00–24:00) instead of visibility/fallback windows, so users can scrub the complete lunar cycle while moonrise/moonset information remains available in ephemeris panels.
- **Map — moon path current-time marker** — Added a highlighted point and time label on the moon path for the exact simulated instant, so slider time and map path position are visually synchronized (independent from nearest static path labels).
- **Observer — auto GPS on load** — On each shell mount / full app load, if the observer is still at the built-in default (`DEFAULT_OBSERVER_LOCATION`) and location is not locked, `useHomeShellOrchestration` requests a GPS fix (secure context + `navigator.geolocation`); removed the module-level one-shot guard so a fresh page visit retries instead of sticking to the default after the first session ever. Successful fixes still call `requestFocusOnObserver()` via `useGpsObserver`. Helper `isDefaultObserverLocation()` in `defaultObserverLocation.ts`. Playwright grants `geolocation` for E2E.
- **UI — app header** — Brand row: logo + **LunaPic** (`mt-title`, large wordmark). Logo bounded with `max-h` / `max-w`; header `self-start` in the shell grid (see Fixed for overlap bug).
- **UI — Flight source provider** — Custom combobox `FlightProviderSelect` (`components/shell/FlightProviderSelect.tsx`) replaces the native `<select>`: sky/zinc glass styling, chevron, listbox in a `document.body` portal (`z-280`) so the menu is not clipped by `ShellSectionCard`’s `overflow-hidden`. Trigger keeps `data-testid="flight-provider-select"` and `data-value` for E2E; `e2e/flight-source.spec.ts` asserts via the live-feed checkbox `data-testid`s and trigger `data-value`.
- **UI — shell sections** — `ShellSectionCard` accepts an optional `icon`; `SectionCardSurface` shares the same frame and top accent line for non-standard headers. `TimeSliderPanel` (`mapChip` and panel) uses `SectionCardSurface` with amber accent and `SectionIconTime` so the map time control matches sidebar cards. Category outline icons live in `sectionCategoryIcons.tsx` and are wired to Flight source, Observer, Moon, Transit candidates, Active transits, Photographer, Compass, and Field panels.

### Added

- **Hosting — cPanel / self-hosted Node** — Root `server.js` runs Next.js after `next build` with `PORT` (and optional `BIND_HOST`, `NEXT_HOST`) for Application Manager-style hosts; `npm run start:cpanel` starts it in production. **Sub-URL** — single source `cpanelBasePath.cjs` (default `/LunaPic`) drives `basePath` in `next.config.ts` and request alignment in `server.js`; E2E uses the same file. Nema više `NEXT_BASE_PATH` u env. Prefer this over `output: standalone`’s bundled server if you use a project-root entry file.
- **Docs — [deployment-cpanel.md](./deployment-cpanel.md)** — Runbook: `cpanelBasePath.cjs`, `server.js`, `NEXT_PUBLIC_BASE_PATH` / `appPath`, what to deploy vs full tree, E2E. Cross-linked from root README, [documentation/README](README.md), [architecture](architecture.md), and [technicalconventions](technicalconventions.md).
- **Docs — [user-guide.md](./user-guide.md)** — Product walkthrough for non-developers: workflow, map legend, observer vs map center, how time simulation and geometry are described in plain language. Linked from root [README](../README.md) and this index so the three READMEs have distinct roles: root = run + index; this folder’s README = doc index; `src/stores/README` = one developer note (Zustand aggregate).
- **Astronomy — moonrise / moonset** — `AstroService.getMoonTimes` wraps suncalc `getMoonTimes` (UTC calendar day) → `MoonRiseSetTimes` in `src/types/moon.ts`. `moon-transit-store` holds `moonRise`, `moonSet`, and `moonRiseSetKind` (circumpolar). `**useAstronomySync`** re-fetches suncalc when **(a)** the observer’s `lat`/`lng` changes and **(b)** on **sync** to “now” via `ephemerisRefetchKey` (incremented in `syncTimeToNow`), using the **current** `referenceEpochMs` to pick the **UTC** calendar day for `getMoonTimes` — *not* on every slider move, so crossing UTC midnight while scrubbing does not swap the rise/set day and break the time-slider window vs the moon path. Domain helpers: `src/lib/domain/astro/moonVisibility.ts` — `isMoonVisibleFromMoonState` / `isMoonVisibleForEpoch` (altitude-based, authoritative for a simulated instant), `isMoonVisibleByRiseSet` (window from rise/set). **UI:** `TimeSliderPanel` and `MoonEphemerisPanel` show “Moon below horizon” when the simulated moon is below the geometric horizon; map moon layers and related overlays dim via `useMapMoonHorizonDeemphasis`. **Data:** `useTransitCandidates`, `useActiveTransits`, and `usePhotographerTools` return empty / null when the moon is not above the horizon at `referenceEpochMs`.
- **Map — selected aircraft stand area** — When a flight is selected, the map shows one semi-transparent sky-blue **ground strip** (500 m–40 km from the aircraft footprint, ±3 km wide) for the **current simulated time** (`referenceEpochMs` via extrapolated position), using **3D line-of-sight** (`horizontalToPoint` with aircraft altitude) for the strip axis (back-azimuth from the sub-aircraft point), not a flat 2D moon direction. A high-contrast **zero-offset center line** (`selected-stand-spine-geo`: `LineString` from `buildStandCorridorSpineLineFeature`) marks the strip’s long axis. Sources: `selected-stand-geo` (fill + outline), `selected-stand-spine-geo` (spine + dark backing) in `registerMoonTransitLayers`; domain in `standCorridorQuads.ts` + `useSelectedAircraftStandCorridorFeatures`.
- **Flight metadata (UI + OpenSky)** — Extended `FlightState` (`originCountry`, `airlineIcao`, `adsbEmitterCategory`, `aircraftType`, `airlineName`). OpenSky parser fills country, ICAO designator from callsign, and emitter category; static routes carry `airline` / `aircraftType` in `routes.json`; mock provider includes demo values. **Selected aircraft** card shows **Airline** and **Aircraft type** via `flightDisplayLabels.ts` and `emitterCategory.ts`.
- **Map — aircraft icon** — Flight layer uses `public/plane_5367346.svg` via `Image` + Mapbox `addImage` + `symbol` (`icon-rotate` from ADS-B track; `FLIGHT_PLANE_ICON_*` in `mapOverlayConstants.ts`). Falls back to the sky-blue circle if the image fails to load. `registerMoonTransitLayers(map, onLayersReady)`; `useMoonTransitMap` bumps `mapReadyTick` when the flight layer is ready.
- **Moon path (map)** — Dashed `LineString` in the map plane: ephemeris samples → `GeometryEngine.buildMoonPathLineCoordinates` (30 min); shorter ray length `MOON_PATH_RAY_LENGTH_M` than the long moon–route azimuth. GeoJSON `moon-path-geo` and hourly labels `moon-path-labels-geo`. **(See Changed — arc is clipped to moonrise/moonset.)**
- **Docs** — `documentation/optimization-and-refactoring.md` — consolidated log of refactors (hooks, `lib/map`, shell panels, `useMoonTransitMap`, `useHomeShellOrchestration`, store design note for `moon-transit-store`).
- **Docs** — `src/stores/README.md` — short Croatian rationale for the single `moon-transit-store` aggregate; cross-links to `architecture.md` and optimization doc.
- **Docs** — `documentation/technicalconventions.md` — “Adding a new feature (checklist)” and State section links to the stores README; geometry split noted under Data and geometry.
- **CI / E2E** — GitHub Actions workflow (`.github/workflows/ci.yml`: ESLint, typecheck, Vitest, build, Playwright). Playwright: `e2e/smoke.spec.ts`, `e2e/flight-source.spec.ts` (provider combobox). `data-testid` for map column (`map-loading`, `map-surface`, `map-missing-token`) and `flight-provider-select` / live-feed checkboxes for the flight source control.
- **Domain** — `GeometryEngine` split into `geometryEngineMoonRay.ts`, `geometryEnginePhotographer.ts`, `geometryEngineTypes.ts`; `geometryEngine.ts` remains a thin facade; `RouteIntersection` exported from types in `lib/domain/index.ts`.
- **Field performance (map)** — `src/lib/perf/fieldPerf.ts`, `FieldPerfOverlay`, React `Profiler` on the map block when `NEXT_PUBLIC_FIELD_PERF=1` or `localStorage.moonTransitFieldPerf`. Instrumented: `useMapMoonOverlayFeatures`, `useMapGeoJsonSync`, `useExtrapolatedFlightsForMap`, `useMoonTransitMap` (`map:moveendToIdle`, `map:boundsRefresh`). See `documentation/performance.md`.
- **Security (dependencies)** — `npm audit` addresses: `@playwright/test` ^1.59.1; `package.json` `overrides.postcss` ^8.5.10. CI runs `npm audit` after `npm ci`.

### Fixed

- **Routing — About with `basePath`** — `next/link` prepends `next.config` `basePath` automatically; passing `href={appPath("/about")}` produced a broken path (e.g. duplicated `/LunaPic`). `CompassAimPanel` and the time-toolbar About control now use `href="/about"`.
- **Field — focal length input** — Replaced controlled `type="number"` that committed on every keystroke (could concatenate with the old value → clamp to 2400, and blocked clearing the field) with a text + `inputMode="decimal"` draft committed on blur / Enter; store clamp 50–2400 unchanged.
- **UI — header logo giant / overlapping map** — Grid row 1 stretched the left `<header>` to match the tall weather + time strip; combined with a large intrinsic `logo.png`, the mark could cover the layout. Fixed with `self-start` + `overflow-hidden` on the header, `max-h`/`max-w` on the `<img>`, `sm:items-start` + `max-h` on the time-slider column in `TimeAndWeatherBlock`.
- **OpenSky + cPanel `basePath`** — Klijentski `fetch` na `/api/opensky/states` ignorirao je subpath (`/LunaPic`), pa je Apache vraćao HTML 404. `NEXT_PUBLIC_BASE_PATH` u `next.config` (isto kao `cpanelBasePath.cjs`) i `appPath()` u `OpenSkyFlightProvider` sada grade ispravan URL.
- **Map — ikona aviona (cPanel `basePath`)** — `FLIGHT_PLANE_ICON_URL` je i dalje bio `/plane_…svg` na root domena; sada `appPath()` u `mapOverlayConstants` da se SVG učita s podputanje; inače `onerror` i plavi krug.
- **OpenSky / Vercel** — API bbox for `/states` is the intersection of the static route corridor and a **~200 km (100 km radius) box around the fixed observer**; **if that intersection is empty**, the provider **falls back** to the corridor ∩ **map viewport**, but **wide viewports are capped to ~90 km** around the viewport center before calling OpenSky (avoids continent-sized queries that time out on Hobby). `**vercel.json`** `regions: [fra1]` plus route `**preferredRegion`** keep execution in **EU**. Default upstream budget **9.2 s** (env **2000–9600**); optional `**OPENSKY_STATES_EXTENDED=0`** omits `extended=1` for a faster smaller JSON; `**maxDuration` 10**; **200** + `timeout-fallback` on failure; **CDN** on success. **Hydration** — `useHasMounted` / `suppressHydrationWarning` in time panels as before.
- **Astronomija / luk Mjeseca (klizač blizu zlaza)** — `useAstronomySync` više ne ponavlja suncalc na svako pomicanje `referenceEpochMs` (npr. prelazak na drugi **UTC** dan dok se klizanjem približavaš `moonset`), što je miješalo prozor vidljivosti i suncalc pa je lomilo slijed etikata na luku. Ephemera se sada povezuju s `ephemerisRefetchKey` (bump u `syncTimeToNow`); dohvat se i dalje javlja pri promjeni promatrača (`lat`/`lng` u efektu).
- **Map — nema vidljivih znakova letova (samo mjesec / prazan `flights-geo`)** — U rano `onload` SVG-a stil ponekad još nije spreman (`!isStyleLoaded`); tada se nije dodavao niti kružni niti `symbol` sloj, a `onLayersReady` se ipak zvao — podaci u storeu, ali **bez** Mapbox sloja. Kružni fallback za `flights-geo` sada se dodaje **sinkrono** na kraju `registerMoonTransitLayers` (iznad ostalih overlaya) i odmah se zove `onLayersReady`; nadogradnja na ikonu i dalje je asinkrona. Ako stil nije spreman u trenutku učitavanja slike, nadogradnja se pokušava nakon `idle`.
- **Flights — prazna karta s Mockom / nakon promjene providera** — `setFlightProvider` briše odabir kad se provider promijeni; `loadFlightsInBounds` briše `selectedFlightId` ako nije u učitanim letovima. `useMapGeoJsonSync` prikazuje **sve** letove kad `selectedFlightId` nije u trenutnom nizu (npr. zastareo ID), umjesto prazne `FeatureCollection` — uz `moveLayer` letova prema vrh stila.
- **Map — flight layer under moon overlays (invisible icons)** — `addLayer(flights, beforeId: moon-intersections)` placed aircraft **beneath** the intersection, moon-path, and stand-corridor layers. After the stand layer moved later in the stack, the **cyan fill and other overlays fully covered the symbols**. The flight layer is now appended **without** `beforeId` so it sits on top of our GeoJSON overlays; the old `moveLayer` workaround was removed.
- **Map — stand corridor hidden under moon layers** — The stand fill/outline were first in the style stack, so the moon azimuth and path **painted on top** and hid the cyan band. The **flights** layer is registered last and `moveLayer`d to the top of the style so the aircraft symbol stays **above** the stand and other GeoJSON overlays; opacities use `SELECTED_STAND_MAP_`* shared with `useMapMoonHorizonDeemphasis`. `SelectedAircraftPopupContent` explains the map tint in English.
- **OpenSky — Aircraft type keeps disappearing** — Not every `/states` response includes `category` (needs `extended=1`; some rows still omit it). `loadFlightsInBounds` now `**mergeStickyFlightMetadata`**: for the same `flight.id`, keep the last known `adsbEmitterCategory` / `aircraftType` / airline fields when a refresh returns `null`. See `src/lib/flight/mergeStickyFlightMetadata.ts`.
- **OpenSky — Aircraft type empty (`—`)** — OpenSky only includes `category` (state vector index 17) when the request uses `**extended=1`**. The Next.js proxy `/api/opensky/states` now appends it so **Aircraft type** can show the ADS-B class (e.g. Large, Heavy). Aligned `emitterCategory.ts` labels with OpenSky’s category table. Parser accepts string or number for `category`.
- **Map — aircraft icon stuck on blue circle** — Removed the 3.5 s timeout that drew the fallback circle while the SVG was still loading; the delayed `loadImage` callback then saw an existing layer and never installed the symbol. Loading now uses `HTMLImageElement`; a fallback circle is only used on `error`, and a late-loaded image replaces an existing circle layer with the plane symbol.

### Changed

- **UI — section cards** — `ShellSectionCard` + `ShellFootnote` u `components/shell/ShellSectionCard.tsx`: svaka glavna cjelina (Flight source, Observer, Moon, Transit candidates, Active transits, Photographer, Compass, Field) u vlastitoj kartici s `rounded-2xl`, gradijentnom gornjom linijom (boja po sekciji) i `section` + `aria-labelledby`; `SidebarSyncFooter` u `ShellFootnote` (isprekidani okvir). Desni stupac više nije ugniježđen u jedan `div` — `Compass` i `Field` su odvojeni kao i ostalo.
- **UI — visual refresh** — `Outfit` kao display font (`--font-outfit`) za naslove; `mt-title` gradijent (sivkasto-bijela / smaragd / nebo); tamna „celestial” pozadina (`mt-app-bg`) s radijalnim nijansama. Stakleni krom (`mt-chrome-bar`, `mt-side-rail`, `backdrop-blur-2xl`), map stub `md:rounded-2xl` s dubinskom sjenom, `mt-map-loading` s blagim shimmerom, toolbar gumbi `mt-toolbar-btn`*, ujednačeni `mt-section-label` za sekcije, dotjeran `mapChip` i weather kartica. `globals.css`: zlatni bljesak i smanjeno kretanje po `prefers-reduced-motion`.
- **UI — time / weather bar** — Lijevi stupac `w-max` + `items-stretch`: oblačnost u punoj širini retka gumbi; vremenska kartica (`mapChip`) `h-full flex flex-col` s `flex-1` na središnji dio da donji rub ispunjava visinu lijevog stupca na širim ekranima.
- **UI — map observer actions** — „Set my location here” i „Focus on me” s **Sync** u `TimeAndWeatherBlock` u ljevom stupcu: **gore** oblačnost, **ispod** tri gumba; vremenski kliznik desno (široki ekran) odnosno ispod tog stupca (uski). Uklonjen `MapObserverControlStrip` s karte. `requestPlaceObserverFromView` + `placeObserverFromViewNonce` u `observer-store`, `useMoonTransitMap` reagira kao na fokus. Duplikat „Focus on me” u `ObserverLocationPanel` uklonjen.
- **UI — mobile shell** — S viewportom `dvh` karta ispunjava srednji segment (`flex-1` + `min-h-0`); uklonjeno ugrađeno `max-h-[40vh]` na bokovima koji je na malim ekranima gutao Mapbox. Ispod karte: kartice **Map & transits** / **Photo & field** s `max-height` ploče i pomicanjem, zadržan je jedan `MapContainer` (nema dvostruke instance). Površine s `border-white/5`, `backdrop-blur` i stišaniji krom; `viewport` u `layout.tsx` s `viewportFit: cover` radi `env(safe-area-inset-*)` na iPhoneu. Hook: `useIsMdUp` u `useMediaQuery.ts` (početak `false` + `useLayoutEffect` kako ne bi bilo odstupanja prilikom hidracije).
- **Map — stand corridor (photographic)** — Single **T=0** band (no 5-minute multi-slab look-ahead). Strip axis from **true horizontal azimuth** to the aircraft at reported altitude (`horizontalToPoint`); **zero-offset spine** line (`selected-stand-spine` / `selected-stand-spine-backing` on `selected-stand-spine-geo`). `useMapGeoJsonSync` updates the spine source; `useMapMoonHorizonDeemphasis` dims spine when the moon is below the horizon.
- **Time slider / moon path (superseded by current product)** — Older releases used a visibility-based slider window and path-only-in-window behaviour. **Current behaviour** is documented in **[Unreleased]** and `documentation/architecture.md`: full **UTC-day** scrubbing, primary path still rise/set–based, optional full-day path overlay, and simulated-instant marker on the path.
- **Default observer** — Initial observer and map center: **Molvanska ulica 1**, Zagreb — exact WGS84 in `src/lib/defaultObserverLocation.ts` (`useObserverStore`, `defaultMapViewState`).
- **UI** — Simulated anchor time in `TimeSliderPanel` uses **dd/mm/yyyy** and **24-hour** local time (`toLocaleString("en-GB", …)`, `hour12: false`).
- **Shell layout** — `HomePageClient` uses three columns on wide screens: left (source, observer, ephemeris, time, candidates, active), center (map), right (`PhotographerToolsPanel`, `CompassAimPanel`, `FieldOverlaysSection`). `SidebarSyncFooter` stays on the left.
- **Docs** — `documentation/README.md` full index (architecture, performance, conventions, optimization, roadmap, changelog, stores README). `architecture.md`: new **Quality assurance** (Vitest, Playwright, CI including `npm audit`, field perf links). `technicalconventions.md`: CI steps list `npm audit` after `npm ci`. Expanded domain + `fieldPerf` tests remain summarized in `technicalconventions` (Testing).
- **Hooks / ESLint** — `useDeviceCompass` (initial `listening` without `setState` in `useEffect`), `useMoonTransitMap` (`providerRef` in `useLayoutEffect`), `useHomeShellOrchestration` (direct `routeCorridor`, `queueMicrotask` for `ephemerisReady`), `useMapGeoJsonSync` (effect deps include `mapRef` / `mapReadyTick`). CI runs `npm run lint`.
- **Map / shell** — `useMoonTransitMap` owns Mapbox init, marker, bounds refresh; observer map actions (set view center → observer, focus) live in the top **time/weather** toolbar; `useHomeShellOrchestration` centralizes `HomePageClient` data flow. `documentation/architecture.md` updated (map source ids, store aggregate note with links to `src/stores/README.md` and `technicalconventions`, extension points). `refactor-roadmap.md` Faza C closed (store docs + `GeometryEngine` module split + feature checklist). `documentation/README.md` and `optimization-and-refactoring.md` §7–8 updated accordingly.
- **Refactor (shell)** — `HomePageClient` orchestration + panels in two sidebars: left (`FlightSourcePanel`, `ObserverLocationPanel`, `MoonEphemerisPanel`, `TimeSliderPanel`, `TransitCandidatesPanel`, `ActiveTransitsPanel`, `SidebarSyncFooter`); right (`PhotographerToolsPanel`, `CompassAimPanel`, `FieldOverlaysSection`); `GoldenAlignmentFlash`. `PhotographerToolPack` exported from `usePhotographerTools` for UI typing.
- **Refactor (architecture)** — Map overlay GeoJSON assembly moved to `useMapMoonOverlayFeatures`; extrapolated flight positions for the map to `useExtrapolatedFlightsForMap`. Shared Mapbox source ids in `src/lib/map/mapSourceIds.ts`, overlay constants in `src/lib/map/mapOverlayConstants.ts`. `useGpsObserver` for geolocation; `formatFixed` / `mpsToKnots` in `src/lib/format/numbers.ts`. **Mapbox layer registration** extracted to `registerMoonTransitLayers` (`src/lib/map/registerMoonTransitLayers.ts`), bounds helper `geoBoundsFromMapbox`, observer marker DOM in `observerMarkerElement.ts`. `**useMapGeoJsonSync`** centralizes `setData` updates for all map GeoJSON sources. See `documentation/refactor-roadmap.md` for the ongoing plan.
- Documentation files live under `documentation/` (see `documentation/README.md`). Root `README.md` and `.cursorrules` point there.

## [0.1.0] — 2026-04-25 (documentation snapshot)

**Summary:** First documented snapshot of the LunaPic app (private Next.js 16 + Mapbox + Zustand).

### Added (feature overview — pre-changelog; approximate)

- **Map** — Mapbox dark basemap, moon azimuth ray, static route polylines, route–moon intersections (yellow markers), flight positions (default **OpenSky** ADS-B, or static/mock) with aircraft symbol + track rotation; flight GeoJSON updates throttled for mobile.
- **Time** — “Simulated now” with ±6 h slider; sync back to system time.
- **Observer** — Fixed ground point, GPS, set from map center, lock, focus map on observer.
- **Flights** — Provider combobox: **OpenSky** (default) → static (`routes.json`) → mock; OpenSky proxied via `GET /api/opensky/states` with client-side filter/retention documented in `architecture.md`.
- **Transit UI** — Candidate list, “active” alignments within tolerance, golden flash at tight alignment; nearest transit window hint from slider search.
- **Photographer** — Countdown to alignment, ω, slant range, transit duration, suggested shutter, optional beep; compass panel; field skew + text/PNG export.

### Fixed / adjusted (not exhaustive)

- Static flight **track** derived from route segment (no longer a constant 90°), so map icons follow corridors.
- Flight **icon** — Rasterized from canvas; symbol layer and layer ordering vs intersection markers; Mapbox `icon-rotate` expression kept compatible with per-feature `trackDeg`.
- **UI** — User-facing copy in English; layout fixes for field/compass sections on small viewports.

### Technical

- **Stack** — Next.js 16, React 19, TypeScript, Tailwind 4, Mapbox GL 3, Zustand, suncalc.
- **State** — `moon-transit-store`, `observer-store`.
- **Domain** — `lib/domain` (astro, geometry, transit screening); flight providers in `lib/flight`.

