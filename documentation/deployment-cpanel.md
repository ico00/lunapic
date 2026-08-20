# Self-hosted deployment (cPanel / sub-URL)

This project can run on **Node.js** in cPanel (or similar) when the public URL is a **subpath** (e.g. `https://example.com/LunaPic`), not the domain root. The following is the **authoritative** layout for that setup; the root [README](../README.md) defers here for runbooks.

## Single source of truth: `cpanelBasePath.cjs` (project root)

- Exports a **string** with a leading slash and **no** trailing slash, e.g. `"/LunaPic"`. Must match the cPanel **Application URL** path segment.
- Drives, via `next.config.ts`:
  - **`basePath`** — Next.js routes, `/_next` assets, and `public/` files are all served under this prefix.
  - **`env.NEXT_PUBLIC_BASE_PATH`** — same value inlined at build time for **client** code.
- Drives `server.js` (Passenger often forwards requests **without** the subpath; the server rewrites the path before the Next handler).
- Drives Playwright `webServer.url` and `e2e/basePath.ts` for E2E.

If you change the subpath, edit **only** `cpanelBasePath.cjs`, then `npm run build` and redeploy.

## Entry process

- **`server.js`** — Custom `http` + `next()` (see [Next “custom server”](https://nextjs.org/docs/app/building-your-application/configuring/custom-server)). Start with:
  - `npm run start:cpanel` (see root `package.json`), or
  - cPanel “Application startup file” → `server.js` with `NODE_ENV=production`.
- **Do not** set `output: "standalone"` for this path unless you switch to the generated `.next/standalone` server; this repo is set up for the project-root `server.js` + full `.next` + `node_modules` layout.
- Binds to `PORT` and `0.0.0.0` by default (see `server.js`); override with `BIND_HOST` / `HOST` if your host requires it.

## Local development

With a non-empty `cpanelBasePath.cjs`, the app is at **`http://localhost:3000`** + that path (e.g. `http://localhost:3000/LunaPic`). The site root `http://localhost:3000/` is not the app home in that case.

## Client code and `basePath`

Next does **not** automatically prefix these:

| Use case | Use |
| -------- | --- |
| `fetch` to App Router `Route Handlers` (e.g. OpenSky proxy) | `appPath("/api/...")` from `src/lib/paths/appPath.ts` |
| URLs to files under `public/` (e.g. Mapbox `Image` for plane icon) | `appPath("/plane_…svg")` (see `mapOverlayConstants.ts`) |

Relying on `"/api/…"` or `"/file.svg"` hits the **domain root** and returns 404 or wrong asset behind a sub-URL.

## What to put on the server

The production host does **not** need to mirror the full git tree.

**Required to run** (after a successful `next build` on a machine with the same `cpanelBasePath.cjs`):

- `.next/` **including `.next/node_modules/`** (symlink aliases for `serverExternalPackages` — see the rsync rules below), `public/`, `node_modules/`, `package.json` (+ lockfile recommended — the server `npm install` reads it)
- `server.js`, `next.config.ts`, `cpanelBasePath.cjs` + root runtime CJS moduli (`flightLogSchema.cjs`, `sdrSnapshot.cjs`, `sdrUrl.cjs`)

**Not required** for run-only: `src/`, `e2e/`, tests, `documentation/`, `.git/`, and most dev config — as long as `.next` is complete.

**To build on the server** (`git pull` + `npm run build`), you need a **full** checkout (including `src/`, `tsconfig.json`, etc.) and a normal `npm install` (devDependencies required for the build on many hosts).

**Secrets:** prefer cPanel “Environment” (e.g. `NEXT_PUBLIC_MAPBOX_TOKEN`) or a server-only `.env` that is not committed, instead of copying `.env.local` from a laptop.

## Environment variables — kritične napomene

### `LOCAL_SDR_URL` (opcionalno — LunaPic ADS-B)

Postavi samo ako imaš lokalni ADS-B prijemnik (dump1090 / readsb na Raspberry Pi):

```
LOCAL_SDR_URL=https://korisnik:lozinka@<node>.<tailnet>.ts.net/tar1090/data/aircraft.json
```

- Credentials (`korisnik:lozinka`) su obavezni jer je nginx na Pi-u zaštićen HTTP basic auth (vidi *nginx basic auth* niže).
- API ruta automatski izvlači credentials iz URL-a i šalje ih kao `Authorization: Basic` header — Web Fetch API ne dopušta credentials direktno u URL-u.
- Ako varijabla **nije postavljena**, API ruta vraća `{“aircraft”:[]}` i “LunaPic ADS-B” checkbox ne prikazuje avione (tiho, bez greške).
- Vrijednost mora biti **javno dostupan** URL (ne LAN IP) jer cPanel server nije na kućnoj mreži — koristi **Tailscale Funnel** (vidi niže).

### `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` (OpenSky feed)

```
OPENSKY_CLIENT_ID=<client id s opensky-network.org → Account → API Client>
OPENSKY_CLIENT_SECRET=<secret, prikazuje se samo pri kreiranju>
```

- **Stare `OPENSKY_API_USER` / `OPENSKY_API_PASSWORD` više ne rade i treba ih obrisati.** OpenSky je ukinuo Basic auth i tiho ga ignorira — zahtjev se posluži kao **anoniman** (400 kredita/dan po IP-u umjesto 4000), pa feed puca na 429 nakon sat-dva. Nema greške koja bi to javila.
- Secret se pokazuje **jednom**. Ako ga nemaš spremljenog, na API Client kartici klikni **Reset Credential** — stari secret ionako ništa ne koristi.
- Provjera nakon restarta: `curl -sI ".../api/opensky/states?lamin=45.3&lomin=15.3&lamax=46.3&lomax=16.3"` → očekuj `x-moontransit-opensky-auth: yes` **i** `x-moontransit-opensky-credits` blizu 4000. Sam `auth: yes` nije dokaz — ruta tiho pada na anonimni pristup ako dohvat tokena ne uspije (log: `proceeding as anonymous`).
- Detalji o kvotama i cijeni po zahtjevu: **[flight-sources.md](./flight-sources.md)**.

### `ADMIN_SECRET` (opcionalno — debug endpoint)

```
ADMIN_SECRET=neki-dugi-random-string-min-32-znaka
```

Štiti `/api/flight-log/debug` koji otkriva interne serverske informacije (path, DB veličina, schema). Bez ovog env vara endpoint je u produkciji automatski **blokiran (403)**. Generiraj: `openssl rand -base64 32`.

### Transit alerti / Web Push (server-side scan)

Da bi pozadinski push alerti radili (obavijest stigne i kad je ekran ugašen / app u pozadini), server-side scan ([architecture.md](./architecture.md#server-side-transit-scan-background-push)) treba ove env varijable u **runtime procesu** (cPanel App Manager → Environment variables):

```
VAPID_PRIVATE_KEY=<iz npx web-push generate-vapid-keys>
VAPID_SUBJECT=mailto:ti@primjer.com
NEXT_PUBLIC_SITE_URL=https://primjer.com/LunaPic      # mora uključivati basePath
INTERNAL_SCAN_TOKEN=<openssl rand -hex 32>
```

- **`VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`** — server-only tajne; **nisu** `NEXT_PUBLIC_`, pa se NE ugrađuju u build i moraju biti runtime env. Bez njih scan/`/api/push/send` vraćaju **503** (`VAPID not configured`). `NEXT_PUBLIC_VAPID_PUBLIC_KEY` se ugrađuje u build (potreban je clientu za `pushManager.subscribe`), pa ne mora biti runtime env — ali ne škodi.
- **`NEXT_PUBLIC_SITE_URL`** — javni URL aplikacije s basePathom. **Kritično pod Passengerom:** `server.js` poller ne može doseći app preko `127.0.0.1:PORT` (Passenger ne veže TCP port), pa `triggerTransitScan` gađa ovaj javni URL. Ako fali ili nema basePath → trigger ide krivo/padne. (Override: `SCAN_TRIGGER_URL`.) Ista varijabla služi i za SEO canonical/sitemap.
- **`INTERNAL_SCAN_TOKEN`** — dijeljena tajna kojom poller autentificira poziv na `/api/transit/scan` (header `x-internal-token`). Generiraj `openssl rand -hex 32`. Bez nje scan vraća **403** i poller tiho odustaje. Mora biti **stvaran slučajan string** — ne placeholder poput `<openssl rand -hex 32>`.
- **Ovisi i o `LOCAL_SDR_URL`** (gore) — poller je heartbeat koji okida scan. Bez aktivnog localsdr pollera nema pozadinskih alerta.
- **Provjera da radi:** u `~/access-logs/<domena>-ssl_log` traži `POST /<base>/api/transit/scan ... "node"` — treba se pojavljivati ~svakih 15 s sa statusom `200` (user-agent `node` = poller, ne browser).

### `touch tmp/restart.txt` vs. full restart

> **Gdje varijable zapravo žive (provjereno 2026-08-20):** cPanel App Manager ih upisuje kao `SetEnv` direktive u **`~/public_html/<app>/.htaccess`**, ne u `.env`. Na serveru `.env` sadrži samo Mapbox token i SSH varijable, a `.env.local` uopće ne postoji — deploy ih ionako isključuje iz rsynca. Kad provjeravaš je li varijabla stvarno u procesu, čitaj env **procesa**, ne datoteku:
>
> ```bash
> pid=$(pgrep -u "$USER" -f "Passenger NodeApp" | head -1)
> tr '\0' '\n' < /proc/$pid/environ | cut -d= -f1 | sort
> ```
>
> Ovim se 2026-08-20 pokazalo da varijable **jesu** u procesu i da problem nije bio u restartu nego u kodu koji je tražio druga imena (vidi [flight-sources.md](./flight-sources.md)).

**`touch tmp/restart.txt`** (što deploy skripta radi) restarta Passenger proces. Ako sumnjaš da `process.env` ne vidi novu env varijablu, najsigurnije je napraviti **Stop → Start** direktno iz App Manager UI-a.

> **Napomena (provjereno 2026-06-02):** u praksi je respawn nakon `touch tmp/restart.txt` **ipak učitao** novo dodane cPanel env varijable (VAPID, `INTERNAL_SCAN_TOKEN`, `NEXT_PUBLIC_SITE_URL`) u novi proces — potvrđeno čitanjem `/proc/<pid>/environ`. Passenger respawna lijeno na prvi HTTP zahtjev, pa nakon touch-a pošalji jedan request (ili otvori app) da se proces ponovno pokrene. Stop → Start ostaje sigurna opcija ako respawn iz nekog razloga zapne.

## Tailscale Funnel — pristup Pi-u iz produkcije

Raspberry Pi je na kućnoj mreži (privatni IP). Da bi produkcijski cPanel server mogao dosegnuti Pi, koristi **Tailscale Funnel**:

```bash
# Na Pi-u (jednom):
sudo tailscale set --operator=$USER   # da Funnel ne treba sudo svaki put
sudo tailscale funnel --bg 80         # eksponira lighttpd (port 80) javno

# Provjeri javni URL:
tailscale funnel status
# → https://lunapic.tailcdc789.ts.net (Funnel on)
```

- Funnel se automatski pokreće uz Tailscale daemon (`systemctl enable tailscaled`) — opstaje kroz reboot.
- DNS propagacija novog Funnel URL-a može trajati do 30 min (provjeri s `dig <url>`).
- Postavi Funnel URL kao `LOCAL_SDR_URL` u cPanel App Manageru i napravi **Stop → Start**.

### Troubleshooting: Funnel pokazuje "on" ali ne prosljeđuje promet

`tailscale funnel status` **nije pouzdan** — može prikazati Funnel kao aktivan dok promet zapravo ne prolazi. Ovo se događa nakon reboota Pi-ja, Tailscale auto-updatea ili `tailscale cert` obnove dok je Funnel aktivan.

**Dijagnoza** — s cPanel servera (ne s Maca, ne s Pi-ja):
```bash
curl -s "https://lunapic.tailcdc789.ts.net/tar1090/data/aircraft.json" | head -c 200
```
Prazan output = Funnel ne radi, bez obzira što status kaže.

**Fix:**
```bash
sudo tailscale funnel reset
sudo tailscale funnel --bg 80
```

**Napomena:** Ne testiraj Funnel s Maca koji je na istom tailnetu — Tailscale interno preusmjerava promet i TLS handshake pada (`SSL_ERROR_SYSCALL`). Uvijek testiraj s cPanel servera ili s mreže koja nije na tailnetu.

**Ne pokreći `tailscale cert`** dok Funnel radi — regeneracija certifikata može baciti Funnel u inkozistentno stanje.

### nginx basic auth na Pi-u

Direktan pristup Pi-u zaštićen je HTTP basic authom putem nginxa:

```
Internet → Tailscale Funnel (443) → nginx :80 [basic auth] → lighttpd :8080 → tar1090
```

- lighttpd (tar1090) sluša na **portu 8080** (interni, nije dostupan van Pi-ja)
- nginx sluša na **portu 80**, zahtijeva credentials, proxira na `localhost:8080`
- Tailscale Funnel i dalje prosljeđuje HTTPS (443) → nginx (80)
- Credentials su u `/etc/nginx/.htpasswd`; dodaj novog korisnika: `sudo htpasswd /etc/nginx/.htpasswd novi_korisnik`

Config: `/etc/nginx/sites-enabled/tar1090`

### lighttpd konfiguracija na Pi-u

`aircraft.json` je dostupan via lighttpd alias (tar1090):
```
/tar1090/data/aircraft.json  →  /run/readsb/aircraft.json
```
Config: `/etc/lighttpd/conf-enabled/88-tar1090.conf`
Port: **8080** (promijenjen iz 80 zbog nginx auth layera — `/etc/lighttpd/lighttpd.conf`: `server.port = 8080`)

## cPanel notes

- Application root in the Node UI should point at the app directory (may be **outside** `public_html`; that is normal).
- Rebuild the app after any change to `cpanelBasePath.cjs` or to client/server code; restart the Node app when only runtime files change.
- You may remove macOS `__MACOSX` directories if they appear in uploads.
- For correct SEO canonicals/sitemap on production, set `NEXT_PUBLIC_SITE_URL` to the full public app URL (with subpath), e.g. `https://example.com/LunaPic`.

## Standardna deploy procedura (rsync)

```bash
./scripts/deploy-server.sh
```

1. Skripta builda lokalno (s produkcijskim Mapbox tokenom iz `.env`), rsynca deploy set i
   touchne `tmp/restart.txt`.
2. **Samo ako se mijenjao `package.json`**: na serveru pokreni `npm install --omit=dev`
   (cPanel gumb *Run NPM Install*, ili SSH uz nodevenv activate) — `node_modules` se
   **ne** rsynca.
3. U cPanelu **Stop → Start** (ne *Restart* — Passenger kod restarta zna zadržati stari
   proces sa starim env varijablama).
4. **Provjera:** otvori `https://<domena>/LunaPic/api/flight-log/debug?secret=<ADMIN_SECRET>` —
   mora vratiti `"wasmExists": true`, `"driverInit": "ok"`, `"dbQueryTest": "ok"`.
   `wasmExists: false` → paket nije na serveru (korak 2) ili je `.wasm` stripan;
   `Failed to load external module <pkg>-<hash>` → `.next/node_modules/` aliasi nisu
   stigli (vidi rsync pravila niže).

## FileZilla deploy — važne napomene

FileZilla (i većina FTP klijenata) uploadaju **samo nove i promijenjene** datoteke. **Ne brišu** datoteke na serveru koje više ne postoje lokalno.

**Kad dodaš novi npm paket** — nakon uploada pokreni na serveru:
```bash
source /home/USERNAME/nodevenv/APP_DIR/20/bin/activate && cd /home/USERNAME/APP_DIR && npm install
```

**Kad ukloniš datoteku iz builda** — datoteka ostaje na serveru i može uzrokovati greške pri pokretanju. Obriši je ručno:
```bash
rm /home/USERNAME/APP_DIR/.next/server/IME_DATOTEKE.js
```

Primjer koji smo naišli: `instrumentation.js` je ostao u `.next/server/` nakon što je uklonjen iz builda, što je uzrokovalo `Cannot find module` grešku pri startu.

**Restart aplikacije** nakon promjena:
```bash
touch /home/USERNAME/APP_DIR/tmp/restart.txt
```

## Flight-log baza — runtime stanje, deploy i recovery

> Vidi i post-mortem: [`incident-flightlog-dataloss-2026-06-01.md`](incident-flightlog-dataloss-2026-06-01.md)

### ⚠️ `data/` se NIKAD ne dira deployom

`data/flight-log.db` i `data/push-subscriptions.json` su **runtime stanje koje server sam
generira**, gitignored, i **ne postoje u lokalnom izvoru**. Deploy ih ne smije ni slati ni
brisati:

- **`scripts/deploy-server.sh` (rsync)** koristi `--delete`. **Mora** imati
  `--exclude='/data/'` — inače `rsync --delete` obriše produkcijsku bazu jer je nema lokalno.
  (To je bio uzrok incidenta 2026-06-01.)

### ⚠️ rsync exclude pravila — tri dokazana footguna (2026-06-01 i 2026-07-21)

Svaku promjenu exclude liste provjeri na sva tri pitanja:

1. **Je li uzorak sidren vodećom kosom?** `data/` matcha na *svakoj* dubini (hvatao je i
   `public/data/` OpenSky indeks); `/data/` samo top-level. Isto: nesidreni `node_modules/`
   je gutao i **`.next/node_modules/`** — symlink aliase koje Next build generira za
   `serverExternalPackages` pakete (npr. `node-sqlite3-wasm-<hash>` → pravi paket). Bez njih
   produkcija pada s `Failed to load external module <pkg>-<hash>`.
2. **Matcha li i symlink varijantu?** Na serveru je `node_modules` **cPanel symlink** u
   nodevenv, a uzorak sa **završnom kosom matcha samo direktorije** — symlink ostane
   nezaštićen i `--delete` ga obriše (app ostane bez ijednog paketa dok se ne obnovi s
   `npm install`). Ispravno: `--exclude='/node_modules'` (bez završne kose).
3. **Štiti li runtime state od `--delete`?** `/data/` (flight-log.db,
   push-subscriptions.json) server sam generira i ne postoji lokalno.
- **FileZilla / FTP** ne brišu, ali pazi da ne uploadaš prazan lokalni `data/` preko punog.

### Čisto zaustavljanje aplikacije

`server.js` na `SIGTERM`/`SIGINT` pozove `saveDb()` **i `process.exit(0)`**. Bez `exit()`
(stari bug) handler "proguta" SIGTERM → proces se ne ugasi, cPanel Stop ne radi, a stari
proces nastavi presnimavati bazu. Ako app i dalje "ne da se ugasiti":

```bash
# Provjeri živi proces:
ps aux | grep "Passenger NodeApp.*APP_DIR" | grep -v grep
# cPanel → Setup Node.js App → Stop (postavi status na "Stopped"), pa po potrebi:
kill -9 <PID>     # SIGKILL se ne može uhvatiti
# Passenger respawna na HTTP zahtjev → zatvori app tabove u browseru dok radiš recovery.
```

### Recovery baze iz backupa (JetBackup)

Ako se baza izgubi/isprazni (32 KB = prazna shema):

1. **Zaustavi app** (cPanel Stop + potvrdi `ps` prazan; `kill -9` ako treba).
2. **JetBackup → Home Directory** → odaberi backup **prije** gubitka → restore/download
   `APP_DIR/data/flight-log.db`. (Download daje arhivu; restore stavi file direktno.)
3. **Provjeri da je valjan i pun** prije starta (node-sqlite3-wasm, isti driver kao app):
   ```bash
   cd ~/APP_DIR && ~/nodevenv/APP_DIR/20/bin/node -e \
   'const {Database}=require("node-sqlite3-wasm");const d=new Database("data/flight-log.db",{readOnly:true});console.log("rows:",d.get("SELECT COUNT(*) AS n FROM positions").n);d.close();'
   ```
4. Obriši eventualni zaostali `data/flight-log.db-journal` iz **starog** procesa prije
   vraćanja datoteke (journal pripada staroj bazi; uz vraćenu kopiju bio bi nekonzistentan).

> **Napomena (2026-07-21, migracija na node-sqlite3-wasm):** stari `chmod 444` trik iz
> sql.js ere više **ne vrijedi**. Writer više ne drži bazu u memoriji niti je presnimava
> svakih 30 s — otvara datoteku izravno i commita po ticku, a read-path prepoznaje zamjenu
> datoteke po inode-u. Recovery je zato jednostavniji: Stop (potvrdi `ps` prazan) →
> restore → provjera (korak 3) → Start.

### Retention (opcionalno, default OFF)

`FLIGHT_LOG_RETENTION_DAYS` — ako **nije** postavljen, poller ništa ne briše (baza raste).
Postavi na broj dana ≥ 1 da uključiš brisanje starijih zapisa (svakih 6h + `VACUUM`).
`pruneOldData` ima sanity-guard: ako bi cutoff obrisao sve redove, prekida se.

## E2E

`playwright.config.ts` reads `cpanelBasePath.cjs` so the smoke tests hit the same base as production. `npm run test:e2e` still expects `npm run build` first and a successful `next start` on port 3000.

## Related

- `src/lib/paths/appPath.ts` — `appPath` helper
- `server.js` — HTTP server and path alignment
- [changelog](changelog.md) — recent hosting-related fixes
