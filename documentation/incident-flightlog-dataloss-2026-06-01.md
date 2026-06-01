# Incident post-mortem — flight-log baza se brisala na 32KB (2026-06-01)

**Status:** Riješeno. Podaci (52 549 zapisa, 1766 aviona) potpuno vraćeni iz JetBackup
kopije. Uzroci popravljeni u kodu i deploy skripti.

**Severity:** Visok — gubitak prikupljene ADS-B baze letova na produkciji.

---

## 1. Sažetak

Produkcijski `data/flight-log.db` se opetovano "resetirao" na **32 KB** (prazna shema,
0 redaka) iako je sadržavao ~7.9 MB stvarnih podataka. Simptom se javljao pri deployu i
restartu aplikacije. Dijagnoza je bila duga jer su **dva neovisna uzroka** davala isti
simptom, plus jedan **red herring** (retention) koji je slučajno davao identičnu veličinu.

**Dva stvarna uzroka:**

1. **`rsync --delete` u `scripts/deploy-server.sh` bez `--exclude='data/'`** — svaki deploy
   je brisao produkcijski `flight-log.db` jer ga lokalni izvor nema (gitignored). Nakon
   brisanja, poller bi pri startu napravio svježu praznu bazu → 32 KB.

2. **Nezaustavljiv app proces** — `process.on("SIGTERM", () => saveDb())` u `server.js`
   **nije pozivao `process.exit()`**. SIGTERM (koji šalju i cPanel Stop i Passenger restart)
   je bio "progutan" → proces nikad ne završi. Stari proces s **praznom** bazom u memoriji
   nastavljao je raditi i `saveDb()`-om svakih 30s presnimavao file na 32 KB. Svaki put kad
   bi se ručno vratio 7.9 MB file i app "restartao", stari živi proces bi ga odmah prepisao.

**Red herring:** retention job (dodan ranije u istoj sesiji) radi `DELETE … + VACUUM`.
VACUUM kompaktira praznu bazu na točno ~32 KB — isti simptom. Zbog toga je retention
dugo bio glavni osumnjičeni iako nije bio uzrok (timestampovi su bili svjež ms podatak,
unutar 90-dnevnog prozora, pa ih DELETE ne bi dirao).

---

## 2. Kako je dijagnosticirano (i zašto je trajalo)

Lanac dokaza koji je na kraju razriješio slučaj:

1. `/api/flight-log/stats` → `total: 0`, file 32 KB → baza stvarno prazna, read-path radi.
2. Debug endpoint je javljao `sql-wasm.wasm` ENOENT — **lažni trag**: debug ruta je
   koristila WASM varijantu sql.js, a cPanel stripa `.wasm`. Pravi read/write path koristi
   `sql-asm.js` (čisti JS). (Popravljeno usput: debug ruta sad koristi asm.)
3. Lokalni round-trip test (load → export → save) **čuva** podatke → kod nije kriv.
4. **`chmod 444` na fileu** ga je zaštitio: kroz 80s s **živim** appom file je ostao
   7.9 MB, isti inode → app ga **presnimava** (write blokiran), ne briše. `writeFileSync`
   na 444 baca EACCES, a `saveDb` ima prazan `catch {}` → tiho preskoči.
5. `kill <pid>` nije ubio proces (isti PID preživio) → SIGTERM se guta → **otkriven
   SIGTERM-bug**. `kill -9` je upalio.
6. Log linija u polleru je pokazala da pri startu poller vidi `exists=true size=32768` —
   file je već bio prazan **prije** nego ga je poller pogledao → netko ga briše/prepisuje
   izvana (stari proces / deploy).
7. `flight-log-RESTORE.db` (ručna kopija, koju app ne dira) je preživio sve → potvrda da
   app piše samo u `flight-log.db`, i da deploy ipak ne briše baš sve iz `data/` u tom
   trenutku (jer RESTORE je nastao nakon zadnjeg deploya).
8. Pregled `deploy-server.sh` → `rsync --delete` bez `--exclude='data/'` = drugi uzrok.

---

## 3. Vremenski tijek (skraćeno)

- Baza je danima rasla preko LunaPic ADS-B pollera (server.js), 7.9 MB / 52 549 redaka.
- Tijekom code-review sesije rađeni su deployi novih promjena. `rsync --delete` je pri
  jednom od njih obrisao `flight-log.db`. Restart je napravio praznu 32 KB.
- Svaki naredni pokušaj vraćanja filea preko cPanel restarta je padao jer (a) stari proces
  se nije gasio i presnimavao prazno, i (b) daljnji deployi bi opet brisali.
- Recovery: JetBackup → **Home Directory** restore/download ranije kopije (7.9 MB, valjan
  SQLite, 52 549 redaka potvrđeno node skriptom s asm sql.js).
- `chmod 444` trik: zaključati file, ubiti stari proces (`kill -9`), pustiti svjež proces
  da učita 7.9 MB u memoriju, pa `chmod 644` da poller piše puni sadržaj. Potvrđeno
  `total: 52549` i stabilna veličina.

---

## 4. Popravci (svi commitani)

| Popravak | Datoteka | Učinak |
|---|---|---|
| `--exclude='data/'` u rsync | `scripts/deploy-server.sh` | deploy NIKAD ne dira `data/` (ni `flight-log.db` ni `push-subscriptions.json`) |
| SIGTERM/SIGINT → `process.exit(0)` nakon `saveDb()` | `server.js` | app se uredno gasi na cPanel Stop / Passenger restart; nema više clobbera |
| Retention **opt-in** + sanity-guard | `server.js` | bez `FLIGHT_LOG_RETENTION_DAYS` ništa se ne briše; guard prekida prune koji bi obrisao sve |
| `loadEnvConfig` na vrhu | `server.js` | `LOCAL_SDR_URL` se čita nakon učitavanja `.env.local` |
| debug ruta → asm sql.js | `src/app/api/flight-log/debug/route.ts` | debug endpoint radi na cPanelu (nema wasm ovisnosti) |

---

## 5. Pouke i prevencija

- **Runtime stanje (`data/`) nikad ne smije biti u dosegu deploya.** `rsync --delete` +
  gitignored `data/` = mina. Sad eksplicitno izuzeto; vidi `deployment-cpanel.md`.
- **Signal handleri MORAJU završiti proces.** `process.on("SIGTERM", fn)` bez `exit()`
  čini app nezaustavljivim — pogađa svaki restart/stop.
- **Isti simptom ≠ isti uzrok.** VACUUM (retention) i fresh-DB (deploy/clobber) oba daju
  ~32 KB. Ne fiksiraj se na prvi osumnjičeni; traži lanac dokaza (inode, size-at-load,
  tko drži file, preživi li "marker" file).
- **`chmod 444` je moćan recovery alat** kad živi proces presnimava file: `writeFileSync`
  → EACCES → app-ov `catch {}` proguta, file ostaje. (Ne štiti od **brisanja** na razini
  direktorija — to je zasebna stvar.)
- **Backup je spasio dan.** JetBackup dnevne kopije + ručni `flight-log-RESTORE.db`.

---

## 6. Povezano

- Recovery runbook + deploy pravila: [`deployment-cpanel.md`](deployment-cpanel.md)
- Code review iz iste sesije: [`code-review-analiza-260531.md`](code-review-analiza-260531.md)
- Changelog unos: `[2026-06-01]` u [`changelog.md`](changelog.md)
