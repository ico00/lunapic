# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Gdje pisati kod

Sesija može biti otvorena u worktreeu (`/.claude/worktrees/…`), ali dev server uvijek radi iz glavnog direktorija (`/Users/icom4/Documents/VibeCode/MoonTransit/`). **Uvijek piši promjene u oba direktorija istovremeno**, ili — bolje — pitaj korisnika koji direktorij je relevantan prije nego počneš. Nikad ne pretpostavljaj da je worktree jedino mjesto.

# Vizualni sustav — obavezno slijediti spec

**Sve vizualne odluke** (tipografija, boje, razmaci, z-index, breakpointi, animacije, combobox uzorak, checkbox stil) definiraju se isključivo u `documentation/ui-generator-technical-spec.md`. Taj dokument je jedini autoritet.

Prije pisanja bilo koje komponente ili UI elementa:
- Pročitaj relevantne sekcije spec-a.
- **Nikad ne koristiti** Tailwind `text-xs`, `text-sm`, `text-base`, `text-lg` i sl. — uvijek `text-[length:var(--fs-label)]`, `text-[length:var(--fs-meta)]`, `text-[length:var(--fs-body)]` itd.
- **Nikad ne koristiti** `text-zinc-*`, `text-white` za boje teksta — uvijek `text-[color:var(--t-primary)]`, `text-[color:var(--t-secondary)]`, `text-[color:var(--t-tertiary)]`.
- Semantički akcenti (emerald / amber / sky / rose) su dozvoljeni za interaktivna stanja i statusne boje prema spec-u §2.7.
- Nove stilske odluke kojih nema u spec-u **prvo dodati u spec**, pa tek onda pisati komponentu.

# Domenska logika — pragovi vidljivosti i transit kandidati

Ovo je **jedini autoritativni sažetak** pravila. Ako mijenjate bilo koji prag, promijenite ga na izvoru (navedena datoteka) i ažurirajte ovaj dokument.

## Vidljivost Mjeseca (izvor: `moonFieldVisibilityAdvice.ts`)

| Altituda | Tier | UI label | Efekt na sustav |
|---|---|---|---|
| < 5° | `critical` | Critical / Hidden | **Nema kandidata, nema alerta.** Obje provjere (`useTransitCandidates`, `useActiveTransits`) vraćaju prazan niz. |
| 5° – 12° | `caution` | Caution / Low | Kandidati se računaju, ali UI pokazuje upozorenje o magli/horizontu. |
| ≥ 12° | `optimal` | Optimal | Normalan rad. |

Konstante: `CRITICAL_BELOW_DEG = 5`, `CAUTION_BELOW_DEG = 12` — obje u `moonFieldVisibilityAdvice.ts`. `CRITICAL_BELOW_DEG` je exportana i koristi se u hookovima.

## Pipeline transit kandidata (redoslijed filtera)

Svaki filter se primjenjuje redom. Ako let padne na bilo kojoj provjeri, **isključen je u potpunosti** (osim gdje je označeno drukčije).

```
1. moon.altitudeDeg < 5°
   → prazan niz (useTransitCandidates + useActiveTransits)

2. Trenutna slant udaljenost > 185 km  [flightFilterBounds.ts: TRANSIT_SCREENING_RADIUS_KM;
   computeTransitCandidates: TRANSIT_SCREENING_SLANT_METERS]
   → isključen iz kandidata
   (100 km + 300 s pri 270 m/s ≈ 181 km; ostali pozivatelji screeninga —
   shot feasibility i zvuk — zadržavaju zadanih 100 km,
   screening.ts: MAX_SLANT_RANGE_METERS)

3. Let se UDALJAVA od Mjeseca (30s lookahead)  [screening.ts: APPROACH_LOOKAHEAD_SEC = 30]
   → isključen iz svega
   (letovi bez speed/track prolaze bezuvjetno)

4. Nedostaje poznata konačna brzina/smjer, photographerPack === null,
   ILI photographerPack.timeToAlignmentSec === null
   → isključen (azimut se nikad neće poravnati s Mjesecom, ILI se poravnanje
   predviđa dalje od `MAX_ALIGNMENT_LOOKAHEAD_SEC` = 300s
   [lineOfSightKinematics.ts: MAX_ALIGNMENT_LOOKAHEAD_SEC;
   azimuthAlignment.ts: solveAzimuthAlignment] — iznad toga
   dead-reckoning s konstantnim track-om/brzinom postaje nepouzdan, pa je
   "willTransit" za takve letove lažno pozitivan)

5. |elevationGapAtAlignmentDeg| > halfVerticalFOV  (kamera-specifično)
   → isključen (neće stati u kadar)

6. futureSlantMeters > 100 km  [computeTransitCandidates: MAX_TRANSIT_SLANT_METERS = 100_000]
   → isključen iz SVEGA — tranzit se predviđa predaleko od promatrača
   (ovo je fotografska granica; korak 2 smije biti širi jer avion do
   poravnanja još leti prema nama)

7. Klasifikacija preživjelih:
   willTransit = |elevationGapAtAlignmentDeg| ≤ moonApparentRadius + aircraftAngularRadius
                                                                  [geometryEnginePhotographer.ts]
   → true  → "Disk transit" sekcija u panelu + okida alert
   → false → "In frame" sekcija (u kadru, ali ne prolazi disk)

8. Alert (useCandidateAlerts + /api/transit/scan) — SAMO willTransit: true
   i potvrda 2 uzastopna svježa fixa istog izvora, s promijenjenom pozicijom
   i novijim timestampom. Predviđeni trenutak poravnanja smije odstupiti ≤10 s.
   Ponavljanje istog fixa ne broji se. Nestanak kandidata, promjena izvora,
   lokacije/kamere ili razmak dokaza >45 s resetira potvrdu.
   [candidateConfirmation.ts: CANDIDATE_CONFIRMATION_FIXES = 2,
    MAX_CONFIRMED_ALIGNMENT_DRIFT_MS = 10_000; rok iz STALE_FIX_AFTER_SEC]
   Aktivni tranziti zadržavaju postojeću neposrednu obradu.
```

**Poravnanje mora biti numerički potvrđeno (2026-09-15).**
`solveAzimuthAlignment` projicira putanju konstantnom brzinom, smjerom i
visinom, evaluira topocentrični Mjesec (`getMoonPosition`, bez faze) u stvarnom
budućem trenutku i traži korijen azimutne razlike do 300 s. Uzorkovanje za
bracket: 10 s; bisekcija najviše 24 koraka; dozvoljeni numerički ostatak
`ALIGNMENT_RESIDUAL_DEG = 0.001°`. Korijen na suprotnoj zraci nije poravnanje.
Tek nakon potvrđenog azimuta `willTransit` provjerava elevation gap prema
zbroju prividnih radijusa. Pragovi 5°/12°, 100 km i FOV ostaju isti.

Stara procjena `-gap / angularRate` mogla je dati "Disk transit" za 43.5 s
uz 5.01° stvarne separacije (sintetička regresija), jer kutna brzina nije
konstantna čak ni na ravnoj putanji. Ne vraćati taj linearni model za
klasifikaciju. Zadane vrijednosti 200 m/s i 90° nisu dokaz za predviđanje;
`photographerPack` bez poznatog konačnog smjera/brzine vraća null.
Kandidati se prikazuju odmah; potvrda iz neovisnih fixova odgađa samo alert.

**Uspon i spuštanje (2026-10-30).** Solver projicira visinu konstantnom
vertikalnom brzinom (`predictedVerticalRateMps`, `extrapolateFlightPosition.ts`);
ispod `LEVEL_FLIGHT_MAX_FPM` = 300 ft/min visina se drži, jer je to u ravnom letu
šum. Mjereno na 12 h produkcijskog loga (105 000 redaka), greška visine, medijan:

| Lookahead | ≥1000 ft/min, stalna visina | ≥1000 ft/min, linearno | Ravan let, stalna visina |
|---|---|---|---|
| 30 s | 236 m | 16 m | 0 m |
| 60 s | 457 m | 47 m | 0 m |
| 120 s | 846 m | 142 m | 8 m |
| 240 s | 1524 m | 459 m | 8 m |

Na 30 km 136 m je polumjer Mjeseca, pa linearni model vrijedi do oko 120 s. Zato
avion koji se penje ili spušta dobiva `willActuallyTransit` tek unutar
`MAX_VERTICAL_PREDICTION_SEC` = **120 s**; ranije je u "In frame" i bez alerta.
Isto vrijedi za scan na serveru, pa `server.js` mora slati `verticalRateFpm`.
Kapica na 90 s nije pomogla (p90 bolji, medijan gori). Prijelaz na ciljanu visinu
(`nav_altitude_mcp`) i buduće skretanje još nisu modelirani; ciljana visina nije
u logu, pa se ne može provjeriti unatrag.

### Dvije izvedbe iste detekcije (klijent + server)

Pipeline iznad postoji u **čistim funkcijama** — jedini izvor istine pragova:
`src/lib/domain/transit/computeTransitCandidates.ts` i `computeActiveTransits.ts`.
Koriste ih dvije strane s **identičnim pragovima**:
1. **Klijent** — izračunato **jednom** po ticku u `useSharedTransitComputation`
   (mount jednom u `useHomeShellOrchestration`) i upisano u dijeljeni store
   `useTransitComputedStore`; hookovi `useTransitCandidates` / `useActiveTransits`
   / `useMoonStateComputed` (`src/hooks/useTransitCandidates.ts`,
   `useActiveTransits.ts`) su samo **selektori** nad tim storeom → in-app audio
   i toast dok je tab vidljiv (`useCandidateAlerts`). Prije 2026-07-22 svaka je
   komponenta (MapContainer, FieldOverlaysSection, CompassAimPanel,
   useHomeShellOrchestration, ArSkyCameraPanel) imala vlastiti `useWallNowMs`
   tick + vlastiti poziv na `computeTransitCandidates`/`computeActiveTransits`
   nad cijelim `flights` nizom — isti posao dupliciran 4-6× na 4Hz, kontinuirano
   dok je app otvorena (dio uzroka pretjeranog CPU/GPU opterećenja na desktopu).
   `useActiveTransits()` više ne prima `toleranceDeg` — jedini pozivatelj je
   uvijek slao default (`DEFAULT_ACTIVE_TRANSIT_TOL_DEG` = 0.5°); ako ikad
   zatreba druga tolerancija, treba proširiti store ili računati tu jednu
   instancu zasebno (ne vraćati duplikaciju na sve pozivatelje).
2. **Server** — `server.js` flight-logger poller na svakom ticku POST-a pun
   snapshot letova internoj ruti `/api/transit/scan` (auth: `x-internal-token` =
   `INTERNAL_SCAN_TOKEN`). Ruta računa kandidate **po pretplati** (svaka push
   subscription nosi svoju `observer` lokaciju + `camera`) i šalje Web Push
   izravno → alerti rade i kad je ekran ugašen / app u pozadini. Ovisi o aktivnom
   SDR feedu (vidi niže) i konfiguriranom VAPID-u; inače tiho isključeno.

Klijent **ne** šalje push (uklonjena `document.hidden → /api/push/send` grana) —
server je jedini vlasnik notifikacija, pa nema dvostrukih alerta.

### Izvori letova — kvote i tempo (detalji: `documentation/flight-sources.md`)

Četiri izvora: **OpenSky** (`opensky`), **adsb.lol** (`adsbone` — id je
povijesni, više ne imenuje operatora), **LunaPic
ADS-B** (`localsdr`, Raspberry Pi) i **Avionix Nano ADS-B** (`avionix`, NanoPi
Neo — isti push princip kao Pi, vidi nižu sekciju za specifičnost uređaja).

**Zadano (2026-10-30):** uključen je samo LunaPic ADS-B (`localsdr`); OpenSky i
adsb.lol su opcija koja se pali ručno, a Avionix je na popisu zasivljen, bez
kvačice i ne može se kliknuti dok je `AVIONIX_FEED_AVAILABLE = false`
(`src/types/flight-provider.ts`). Odabir se ne pamti — svako učitavanje kreće od
zadanog. Detalji: `documentation/flight-sources.md` ("Defaults").

Dvije stvari koje se lako slome i ne javljaju se same:

* **OpenSky traži OAuth2** (`OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`).
  Basic auth je ukinut i **tiho** se tretira kao anoniman pristup → 400 kredita
  dnevno po IP-u umjesto 4000. Krediti se troše **po zahtjevu**; preostalo stanje
  vraća se u `X-MoonTransit-OpenSky-Credits`.
* **Tempo je budžet, ne preferencija.** Web izvori 30 s
  (`LIVE_AUTO_REFRESH_MS`), Pi 5 s (`LOCALSDR_AUTO_REFRESH_MS`), Avionix
  10 s (`AVIONIX_AUTO_REFRESH_MS`), **sva tri stanu dok je tab skriven** —
  `useMoonTransitMap.ts`. Ne spajati ih natrag u jedan interval: prije je
  uključen Pi checkbox dizao i OpenSky na 10 s i trošio dnevnu kvotu za ~sat
  vremena.

Proxy rute `/api/adsbone/point`, `/api/localsdr/aircraft` i
`/api/avionix/aircraft` (pull grane) imaju circuit breaker — 3 uzastopna
neuspjeha → `503` + `Retry-After` (`src/lib/server/upstreamCircuitBreaker.ts`).

### Kad isti avion vide oba lokalna prijemnika (kontinuitet, 2026-08-25)

Za `icao24` koji vide i Pi i Avionix geometriju vodi **svježiji i potpuniji**
snimak, ne fiksno Pi — `pickFreshestLocalSnapshot` / `mergeLocalFeeds` u
`mergeLiveFlightLists.ts`. Redoslijed pravila: (1) tko ima track+brzinu,
(2) tko je unutar `LOCAL_FEED_TAKEOVER_AFTER_MS` = **15 s**, (3) tiebreak
`localsdr > avionix` dok su oba svježa. Isto pravilo vrijedi na punom ticku i na
brzom ticku pojedinog izvora (`mergeLocalFeedTickIntoPrevious`) — inače se izvor
prebacuje između tickova i marker skače. Isti prag i u `server.js` polleru
(`LOCAL_FEED_TAKEOVER_AFTER_MS`), pa se poklapaju log, push alerti i karta.

**Zašto ne bezuvjetni fiksni prioritet** (kako je bilo od #36 do 2026-08-25):
tar1090 drži avion u `aircraft.json` i nakon što mu prestane stizati signal, uz
sve veći `seen_pos`. Mjereno na živom feedu (431 redaka / 2 min): **12.3 %**
redaka starije od 25 s, **7 %** starije od 40 s — a 40 s je `MAX_LEAD_SEC` u
`extrapolateFlightPosition`, iznad kojeg se marker doslovno zamrzne. Fiksni
prioritet je značio da Avionix ne smije preuzeti takav avion iako za njega ima
svjež fix; marker je stajao, odbrojavanje se računalo prema poziciji
kilometrima iza stvarne, a na sljedećem punom ticku je skočio.

Tiebreak (3) mora ostati fiksan: dva neovisna prijemnika gotovo nikad ne
dekodiraju identičnu poziciju (p50 razlika ~100 m), pa bi "noviji pobjeđuje"
značilo naizmjenično biranje svaki tick i vidljivo treperenje.

Kad pobjednik nema track/brzinu/visinu, posuđuju se od gubitnika
(`withBorrowedKinematics`, i iz web izvora u `mergeLiveFlightListsWithSdrPriority`).
Position-only ADS-B redak inače sruši `timeToAlignmentSec` na `null` → let
ispadne iz kandidata i izgubi odbrojavanje iako je na karti.

### Avionix `timestamp` je epoch ms kao string, ne ISO

Uređaj šalje `{"timestamp":"1787679514274", ...}`. `Date.parse` na tome vraća
**NaN**, pa je do 2026-08-25 svaki avionix fix tiho dobivao `Date.now()` —
`extrapolateFlightForDisplay` nije imao što kompenzirati, a fix je u produkciji
star do ~20 s (push 10 s + client poll 10 s + provider cache 3 s). Izmjereno:
p90 **1.2 km**, max **4.2 km** razlike prema localsdr poziciji istog aviona u
istom trenutku — točno veličina skoka pri prebacivanju izvora.

`parseAvionixTimestampMs` (klijent: `parseAvionixAircraft.ts`, server: isti
helper u `server.js`) prihvaća ms/sekunde/ISO i **odbija sat koji odstupa više
od 5 min** (NanoPi nema RTC, root mu se resetira na reboot) — tada se pada na
`Date.now()`. Uređajev `update_age` (~270 ms) potvrđuje da mu je interna tablica
sub-sekundno svježa; jedini problem je bio parsiranje.

**Ali `timestamp` je vrijeme ODGOVORA, ne vrijeme fixa.** Uređaj nema
per-aircraft polje starosti (tar1090 ima `seen_pos`). Izmjereno usporedbom s
Pi-jevom putanjom: za avione koje **oba** prijemnika vide, avionix redak je
svjež — p50 **1 s**, p90 **4 s**, max 24 s. Za avione na rubu dosega koje Pi ne
vidi, isti redak zna stajati **desecima sekundi** i onda skočiti (snimljeno:
EXS37E zamrznut 26 s pa skok 20 km) — uređaj drži zadnju dekodiranu poziciju bez
oznake da je stara. Zato:

* Prag preuzimanja se oslanja na tu razliku: Avionix preuzima **samo** avion koji
  oboje vide, gdje je izmjereno svjež.
* `stabilizeTimestamps` u `avionixFlightProvider` je jedina obrana za rubne
  avione — pamti kad se pozicija STVARNO promijenila, pa zamrznut redak nakon
  ~45 s padne u `isFlightFixStale` i prestane generirati kandidate/alerte.

### Prag „fix je prestar da bi se iz njega računalo”

`STALE_FIX_AFTER_SEC` = `MAX_LEAD_SEC + 5` = **45 s**
(`src/lib/flight/flightFixFreshness.ts`). Iznad toga `extrapolateFlightForDisplay`
ionako više ne pomiče marker (kapica leada), pa je pozicija fikcija:
`screenTransitCandidates`, `computeActiveTransits` i `usePhotographerTools`
takav let preskaču (`reason: "staleFix"`), a **na karti ostaje** — bolje ga
vidjeti nego da nestane. Vrijedi i za server-side `/api/transit/scan`, pa push
alert ne može doći iz zamrznute pozicije.

Mjereno na živom feedu: pri starosti fixa preko 15 s medijan greške prikazane
pozicije je **8.4 km**, rep ide do **27 km** — to je bio izvor „odbrojavanje
teče, a aviona tamo nema”.

### Kako ADS-B podaci s Pija dolaze do servera (push, ne pull)

**Produkcija — Pi šalje.** Pi svakih ~5 s (systemd timer) POST-a svoj
`aircraft.json` kao gzip na `/api/localsdr/ingest` (auth: `x-sdr-token` =
`SDR_INGEST_TOKEN`). Ruta validira da je tar1090 JSON i atomično zapiše
`data/sdr-snapshot.json`. Čitaju ga `/api/localsdr/aircraft` i `server.js`
poller; snapshot stariji od 60 s smatra se mrtvim.

**Ritam 5 s (2026-10-30).** Prije je Pi slao svakih ~16 s, a potvrda alerta traži
dva različita fixa, pa je samo ritam odgađao alert za barem toliko. Poller i
server-side scan sada rade na 5 s, klijent također. **Upis u `positions` ostaje
na ~15 s** (`MIN_LOG_INTERVAL_MS` u `server.js`): `MIN_MOVE_M` to ne čuva, jer
avion prijeđe 120 m u sekundi, pa bi baza inače rasla 3× brže. Ne slati samo
avione blizu promatrača radi uštede — flight log i forecast koriste puni doseg.
Gzip je zato jedina ušteda (~10 KB umjesto ~63 KB po snimku).

**Kad Pi utihne (2026-10-30).** Pi je jedini zadani izvor, pa njegov pad gasi i
server-side alerte. `server.js` zato prati polje `now` u snimku
(`receiverWatchdog.cjs`) i nakon `RECEIVER_OFFLINE_AFTER_MS` = **5 min** bez novih
podataka šalje Web Push svim pretplatama, a još jedan kad se podaci vrate
(`/api/push/receiver-status`, isti token kao scan). Mjeri se promjena `now`, ne
vrijeme prijema: ako `readsb` padne a push radi dalje, stiže uvijek isti snimak.
Stanje je u memoriji, pa restart tijekom prekida šalje obavijest ponovno.
`/api/localsdr/aircraft` bez svježeg snimka vraća **503**, kao i Avionix: prije je
vraćao `200` s praznom listom, pa `offline` oznaka u panelu nikad nije zasvijetlila.

**Zašto push:** ranije je server **povlačio** podatke s Pija preko Tailscale
Funnela. To zahtijeva da Pi bude javno dostupan — Funnel → javni DNS → cert →
ingress. Ta se registracija pokazala nestabilnom: javni DNS zapis za
`<node>.<tailnet>.ts.net` je titrao (jedni resolveri ga vide, drugi ne, mijenja
se iz minute u minutu), pa je feed padao svakih par dana uz poruku
`fetch failed: ENOTFOUND`. Dijagnosticirano 2026-07-20. Pi ima pouzdan
**izlazni** internet, pa je smjer obrnut i Funnel više nije potreban.

**Datoteka, ne memorija:** Next rute i `server.js` ne dijele pouzdano modulnu
memoriju (bundler ih razdvaja), a Passenger može podići više procesa. Logika je
u `sdrSnapshot.cjs` na korijenu — isti CJS/ESM shared obrazac kao `sdrUrl.cjs`;
`src/lib/server/sdrSnapshotStore.ts` je samo typed wrapper.

**Pull i dalje radi** kao fallback kad snapshota nema a `LOCAL_SDR_URL` je
postavljen — koristi se u lokalnom devu na istoj mreži (`lunapic.local`).

Instalacija na Piju: `scripts/pi-sdr-push.sh` + `lunapic-sdr-push.{service,timer}`
(upute u zaglavlju skripte).

### Avionix Nano ADS-B — isti push princip, drugačija instalacija

Isti obrazac kao Pi (push → `/api/avionix/ingest`, auth `x-avionix-token` =
`AVIONIX_INGEST_TOKEN`, `data/avionix-snapshot.json`, zaseban
`avionixSnapshot.cjs`) — namjerno zaseban od `sdrSnapshot.cjs`/localsdr
infrastrukture, ne parametrizacija istog koda, jer je oblik payloada
strukturno drugačiji (`{"<icao24>":[...]}` umjesto tar1090-ovog
`{"aircraft":[...]}`).

**Specifičnost uređaja (NanoPi Neo, "AVIONIX openAir" firmware):** `/` je
`overlayroot=tmpfs:recurse=0` — cijeli root (uključujući
`/etc/systemd/system`, crontab) resetira se na **svaki reboot** natrag na
tvornički image. Samo `/data` (zaseban ext4 mount) je trajan. Zato instalacija
push skripte NIJE plain `sudo install` kao na Piju — skripta ide na `/data`
(trajno), a systemd `.service`/`.timer` datoteke se trajno postave preko
`sudo overlayroot-chroot` (vendor-dokumentirana metoda u `/etc/fstab`
headeru). Upute korak-po-korak: header komentar u `scripts/avionix-push.sh`.
Instalacija je 2026-08-20 potvrđena preko reboota — timer je preživio reset i
automatski se pokrenuo.

**Stari CA bundle na uređaju:** `ca-certificates` je iz 2016. (Ubuntu 16.04,
EOL — `apt-get update` na repoima za 16.04 više ne radi pouzdano, a i da radi,
promjena bi se izgubila na sljedećem reboot-u zbog overlayroot-a). POST prema
produkciji (HTTPS) zato puca s "server certificate verification failed" bez
svježeg CA bundlea. Riješeno stavljanjem `cacert.pem` (preuzet **na drugom
računalu s ispravnim TLS-om**, ne na samom uređaju) na `/data/avionix-push/` —
skripta ga automatski koristi ako postoji (`CACERT_FILE` u
`avionix-push.sh`). Isto vrijedi za bilo koji budući stariji ADS-B uređaj s
istim firmware obrascem.

Detalji o samom uređaju (device API, GPS pozicija, Beast port): vidi
`documentation/flight-sources.md`.

### Origin/destination — samo Avionix, i samo za prikaz

**Zašto Avionix ima origin/destination a Pi (`localsdr`) nema:** to je razlika
u firmwareu, ne u prijamu signala. ADS-B protokol **nema** polje za
origin/destination — avion to nikad ne emitira preko RF-a. Avionix Nano
("AVIONIX openAir" firmware) ima ugrađen **dispatcher** koji sam pogađa rutu
(vjerojatno lookup callsigna protiv interne/vanjske baze rasporeda letova) i
šalje rezultat kao indekse 10/11 u `/flight_updates` (`parseAvionixAircraft.ts`
field-order komentar). Pi vrti `dump1090`/`readsb` (tar1090 JSON,
`{"aircraft":[...]}`) — čisti ADS-B dekoder bez ikakve dispatch/route logike;
format nema to polje pa ga `localsdr` parser ni ne može pročitati.

**Ne smije se koristiti za logiku.** Dispečerski pogodak nije autoritativan —
puca na neredovnim/charter/cargo/pozicijskim letovima (nema uparenog voznog
reda), divertiranim letovima (baza pokazuje plan, ne stvarnost), vojnim/GA
letovima (nema ih u komercijalnoj bazi) i zastarjeloj bazi na uređaju. Zato je
**namjerno izolirano na prikaz**: `FlightState` (tip koji pogoni geometriju
tranzita, screening, alertove) **nema** polje za origin/destination — vidi
komentar u `parseAvionixAircraft.ts` ("intentionally not mapped"). Jedino mjesto
gdje se ti podaci uopće koriste je flight-log SQLite (`flightLogSchema.cjs`,
upisano iz `server.js`) i njegov UI (`FlightLogPanel.tsx`,
`app/flight-log/page.tsx`) — čisto informativna kolona za povijesni pregled.
Ne dodavati ih u `FlightState` niti u bilo koji filter/alert bez da se prvo
ažurira ovaj odjeljak.

## Aktivan transit (`useActiveTransits`)

Let je u "active transit" kad mu je **puna 2D kutna separacija** od Mjeseca ≤ 0.5° (kombinacija azimuta + elevacije, ne samo azimut). Koristi `angularSeparationDeg` iz `sky-separation.ts`.

## Dimenzije zrakoplova (wingspan / length)

Geometrija (shot feasibility, viewfinder, transit duration) koristi **stvarne
dimenzije** kad su poznate, inače default 40 m:

1. OpenSky indeks (`public/data/opensky-aircraft/`) daje ICAO typecode za
   icao24 (tuple[0]).
2. `aircraftTypeDimensions.ts` mapira typecode → `{wingspanMeters, lengthMeters}`
   (~150 tipova + obiteljski prefix fallback, npr. `B73*` → B738).
3. `useFlightAircraftTypeIndexPrefetch` puni `FlightState.wingspanMeters` /
   `lengthMeters` u store (patch ne gazi vrijednosti iz providera);
   `mergeStickyFlightMetadata` ih zadržava preko poll tickova.
4. Potrošači: `evaluateShotFeasibility` (wingspan → coverage %),
   `photographerPack` (`airlinerLengthMeters` → transit duration + willTransit
   disk radius), `ViewfinderPreview` (length → silueta).

Avion bez zapisa u indeksu (novi/vojni/čarter) ostaje na defaultu 40 m —
konzervativno veći disk. **Server-side scan** (`/api/transit/scan`) dobiva tip od
`server.js` (`aircraftIndexLookup.cjs`, isti indeks iz datoteke) i iz njega računa
iste dimenzije, pa push i klijent procjenjuju isti disk.

Pi vrti `readsb` bez baze tipova (feed nema `t`/`r`/`desc`), pa isti lookup puni i
`positions` i `aircraft` za `localsdr`. Pokrivenost živog feeda je ~68 % (2026-10-30,
119 od 174 aviona). Povijesni redovi se ne dopunjuju.

## Obrnuti problem — „gdje stati” (`moonShadowSpot.ts`)

Cijeli pipeline iznad **fiksira promatrača** i pita hoće li avion proći preko
Mjeseca. `solveMoonShadowSpot` rješava suprotan smjer: za dani avion (pozicija,
visina, trenutak) traži **točku na tlu** s koje avion pada na disk Mjeseca —
„sjenu” aviona duž mjesečeve zrake.

**Ne koristiti `groundDistance = h / tan(moonAlt)`.** Ta zatvorena formula
pretpostavlja ravnu Zemlju; na 30 km tlocrtne udaljenosti sfera padne ~70 m
ispod tangentne ravnine, što nagne liniju gledanja za `g / 2R` ≈ **0.135°** —
preko četvrtine promjera Mjeseca, dakle promašaj. Formula služi samo kao
početna procjena, pa se Newtonovim koracima dotjera nad istom ECEF geometrijom
koju koristi ostatak aplikacije, uz **ponovni izračun Mjeseca u kandidatnoj
točki** svakog koraka (topocentrična paralaksa pomiče Mjesec ~0.0075° na svakih
50 km pomaka promatrača).

### Pokrivenost je ograničena visinom — 50 % često ne postoji

Na samoj tranzitnoj točki slant je `h / sin(moonAlt)`, pa je

```
coverage% = 11459 · wingspan[m] · sin(moonAlt) / h[m]
```

| Avion | Visina | Max coverage (Mjesec u zenitu) | Za 50 % treba |
|---|---|---|---|
| 40 m raspon (default) | 11 km | **41.7 %** | nemoguće |
| A380 (79.8 m) | 11 km | 83 % | Mjesec ≥ 37° |
| A320 na prilazu | 900 m | >400 % | trivijalno |

Zato `/api/flight-log/photo-spots` **uvijek** vraća `bestCoveragePercent` —
prazna lista na pragu od 50 % je činjenica o nebu, ne bug. `maxCoveragePercentForAltitude()`
je ista računica kao pomoćna funkcija.

### Tolerancija je elipsa, ne krug

Da avion ostane na disku, promatrač smije odstupiti:
- **poprečno** na azimut Mjeseca: `moonApparentRadius[rad] · slant` (na 30 km ≈ **±130 m**, na 10 km ≈ ±44 m)
- **uzduž** azimuta: isto `/ sin(moonAlt)` — uvijek labavije

Zato je upotrebljiva površina elipsa izdužena prema Mjesecu. Isti razlog zbog
kojeg postoje trake `standCorridorQuads`.

### Dva potrošača istog solvera

1. **Planer (B)** — `/api/flight-log/photo-spots`. Obrnuti blizanac
   `transit-calendar`: dijele `callsignSchedule.ts` (circular-mean raspored +
   closest approach), ali umjesto provjere separacije s balkona računa se
   točka na tlu za **srednju putanju u vremenski poravnatim koordinatama**
   (`meanTrackAroundApproach`). Izlaz nosi i `trackSpreadM` — povijesno
   rasipanje same rute; kad je puno veće od `crossTrackToleranceM`, prognoza
   imenuje kvart, ne parkirno mjesto. Filteri: `MIN_AIRCRAFT_AGL_M = 300`
   (slijetanja i taxi ruše ravnu-podlogu pretpostavku), `MIN_SOLVED_SAMPLES = 5`,
   `maxSpreadKm` (default 2.5). `minCoveragePercent` je **samo donja granica** —
   avion širi od diska Mjeseca (prilazni promet redovito prelazi 150 %) je
   željeni rezultat, ne outlier; ništa ne filtrira pokrivenost odozgo.

   ⚠️ `meanTrackAroundApproach` **fiksira populaciju sesija** (one koje pokrivaju
   sidro) i prozor skraćuje na prvoj rupi. Prosjek „onih sesija koje baš tamo
   imaju podatke” daje diskontinuiranu krivulju: kad jedna sesija ispadne a
   druga uđe, prosjek skoči za razmak između njih — a sjena je udaljena
   `h / tan(moonAlt)`, pa pri Mjesecu na 7° 1 km pomaka prosjeka postane 8 km
   skoka u odgovoru. Viđeno u produkciji 2026-08-21 (skok od 13 km u jednom
   15 s uzorku + šiljak od 7 km tamo-natrag).
2. **Live (A)** — `liveShadowTrack.ts` + `useSelectedFlightShadowTrack`. Za
   **odabrani** avion crta centralnu liniju idućih 300 s (isti horizont kao
   `MAX_ALIGNMENT_LOOKAHEAD_SEC` — dalje dead-reckoning laže). Točka putuje
   brzinom aviona (~15 km/min), pa ovo nije mjesto na koje se stigne odvesti
   nego odgovor na „jesam li na liniji i na koju stranu”. Računa se na
   **bucketu od 5 s**, ne na 4 Hz field ticku — vidi CPU incident u sekciji o
   `useSharedTransitComputation`.

### Cijena forecast ruta — cache, indeks, ANALYZE (2026-08-21)

`photo-spots` i `transit-calendar` su **skupe po pozivu** i keširane. Sve tri
stvari niže su naučene u produkciji; svaka je jednom već bila tiho slomljena.

**1. Cache ključ ne smije pratiti datoteku.** `dbVersionKey()`
(`flightLogDb.ts`) vraća `${ino}:${floor(MAX(id) / 5000)}`, a NE `mtime:size`.
Poller prepisuje bazu svakih ~15 s, pa je ključ na `mtime` jedinstven po
zahtjevu i TTL cache je mrtav kod — točno to se i događalo do 2026-08-21
(izmjereno: dva uzastopna identična zahtjeva, 12.1 s i 12.3 s). Tri dijela,
tri različita razloga: `ino` je **egzaktan** (vraćena/zamijenjena baza ne smije
posluživati stare rezultate), bucket po `MAX(id)` hvata *koliko* je povijesti
stiglo (bulk import preskoči više bucketa odjednom i invalidira odmah), a TTL
pozivatelja (5–15 min) je strop zastarjelosti i jedini koji u normalnom radu
uopće okine.

**2. Čitanje je I/O-bound, ne CPU-bound.** `getAllCallsignSessions` čita cijeli
prozor (default 30 dana ≈ 1.3 M redaka). Nosi ga
`idx_pos_callsign_time_cover(callsign, logged_at, lat, lng, alt_geom_m,
alt_baro_m)` — **covering**, pa se tablica ne dira i nema sorta. Bez njega:
105 863 read poziva / 434 MB po zahtjevu; s njim: 36 199 / 148 MB (mjereno na
sintetičkom logu od 2.5 M redaka). Uski `idx_pos_callsign` je time suvišan
(`callsign` mu je vodeći stupac) i namjerno je obrisan. Redci se čitaju
`Statement.iterate()`, ne `db.all()` — `all()` materijalizira 1.6 M+ objekata
u niz da bi ih se jednom prošlo.

**3. ⚠️ Indeks bez `ANALYZE` planer IGNORIRA.** Najvažnija stavka ovdje.
Indeks je na produkciji bio uredno izgrađen, a upit je i dalje išao
`idx_pos_logged_at` + TEMP B-TREE. Uzrok je u statistici koju `ANALYZE` zapiše:
`idx_pos_logged_at -> 1597107 1`, dakle **jedan redak po jedinstvenom
`logged_at`** — timestampovi su gotovo jedinstveni, pa bez statistike SQLite
pretpostavi da je `logged_at BETWEEN` vrlo selektivan, iako taj raspon vraća
79 % tablice (30-dnevni prozor nad 60 dana povijesti). Lokalno se to NE vidi
ako testna baza ima točno onoliko povijesti koliko i prozor.

**Indeks se gradi `scripts/build-flight-log-index.mjs`, nikad pri startu.**
`migrate()` ga stvara s `IF NOT EXISTS`, ali `migrate()` se zove iz `server.js`
**prije** `server.listen()`, a driver je sinkron — prva izgradnja nad
produkcijskom bazom (7.1 s na 243 MB) znači da app toliko dugo **ne sluša na
portu**. Skripta radi isto dok app normalno radi (cijena: poller preskoči koji
tick), uvijek pokrene i `ANALYZE`, i ima `--dry-run`. Nakon nje je
`migrate()` no-op od ~1 ms.

### Planer za LDZA (Planning panel, `runwayShadowPlan.ts`)

Treći potrošač istog solvera, ali s **virtualnim avionom** umjesto stvarnog:
za odabrani dan/prozor/korak računa liniju „stani ovdje” po trenutku za prilaz 04
(3°, TCH 15 m — `LANDING_*` konstante) i odlazak 22 (`DEPARTURE_CLIMB_GRADIENT`
= 0.08 od početka staze, kalibrirano na ručni KML: ≈745 m na 6 km od praga 04).
Avion se postavlja na 3–15 km (korak 0.5) od praga 04 duž produžene osi; svaka
točka je `solveMoonShadowSpot` s `groundHeightMeters = LDZA_ELEVATION_M` (107).
Pozicija stajanja **uzduž linije određuje na kojoj udaljenosti od staze avion
prelazi Mjesec** — zato su markeri na 4/6/8/10/12 km. Prag pokrivenosti je samo
donja granica (kao u photo-spots). Profili su **pretpostavke**, ne mjerenja:
stvarni avion odstupa (vjetar, ATC, masa), pa je plan lokacije, ne garancija.
Regresijski test u `runwayShadowPlan.test.ts` uspoređuje točke s ručnim KML-om
za 28.10.2026 07:20 (unutar 60 m). Stanje: `runwayPlanLines` /
`runwayPlanFocusMs` u storeu, panel ih objavljuje i briše pri zatvaranju;
sloj `useRunwayPlanLayer`.
Panel nudi i pregled „Days with the Moon up” (`runwayPlanDays.ts`): po danu prozori
u kojima je Mjesec ≥ `CAUTION_BELOW_DEG` (12°, sada exportan) i osvijetljenost; ne zna
stazu u upotrebi (vjetar), pa ne ocjenjuje 04 nasuprot 22. Zadani prikaz karte je
jedno vrijeme (`runwayPlanShowAll=false`) — sva vremena odjednom čine nečitljivu traku.

### Ne zvati `getMoonState` iz geometrije

`getMoonState` radi **pet** astronomy-engine poziva: `Equator` + `Horizon` za
poziciju, pa `MoonPhase` i još dva `Equator` (jedan za Sunce) samo za
`phaseFraction`/`illuminationFraction`. Faza je **67 %** cijene (mjereno na
20 000 izračuna: 126 ms pozicija, 260 ms faza).

Solveri (`solveMoonShadowSpot`, `liveShadowTrack`) čitaju samo altitudu,
azimut i prividni radijus, a Mjesec evaluiraju desetke tisuća puta po
zahtjevu — zato koriste **`getMoonPosition`** i tip `MoonPosition`.
`createMoonStateCache` također vraća `MoonPosition`. `getMoonState` je za
prikaz (faza, osvijetljenost).

Cache Mjeseca ima ~23 % pogodaka i to je **strukturno**: vrijeme se ne smije
bucketirati (Mjesec se giba ~0.25°/min), a svaki uzorak je na svom trenutku.
Optimizira se cijena promašaja, ne hit rate.

### Gdje ide vrijeme u `photo-spots` (profil, ne pretpostavka)

Prije bilo kakve optimizacije — izmjeri. Dva puta je intuicija ovdje bila
kriva:

* Newton petlja u `solveMoonShadowSpot` vrti se **0.69 iteracija po pozivu**
  (33 795 poziva, 23 405 iteracija) — većina izađe prije petlje, na pragu
  Mjesečeve visine. Optimizacija početne procjene tu **nema što skratiti**.
* Sintetička testna baza vjerna po broju redaka i veličini i dalje može lagati:
  premala dubina povijesti sakrila je `ANALYZE` problem, a brži lokalni CPU
  dao je projekciju 2.9 s za nešto što je na produkciji bilo 7.9 s. DB dio je
  I/O-bound (disk usporediv), solver je čisti CPU (dijeljeni vCPU višestruko
  sporiji).

Stanje nakon svega (produkcija, cold, svjež cache ključ): `photo-spots` ~4.0 s,
`transit-calendar` ~2.5 s, keširano 0.10–0.14 s.

## Shot feasibility — zelena ikona na mapi

Dvije neovisne provjere:
1. `isPossibleTransit` — trenutna separacija ≤ moonRadius + aircraftAngularRadius (geometrijsko preklapanje sada)
2. `slantRange ≤ maxShotRangeMetersForCamera(focalMm, sensorType)`
   - Baseline: 120 km pri 600 mm full-frame  (`BASELINE_RANGE_M = 120_000`, `BASELINE_FOCAL_MM = 600`)
   - Skalira linearno s efektivnom žarišnom duljinom (focal × crop factor)

Rating u `PhotographerToolsPanel`:
- **EXCELLENT**: range < 80 km AND coverage > 10 %
- **POOR**: range > 150 km OR coverage < 3 %
- **FAIR**: sve između

## Krug na mapi

- **Vizualni prsten**: 80 km (iscrtava `useMapObserverRadiusSync`) — "vrijedi promatrati"
- **API query radius**: 100 km (OpenSky bbox, `openSkyStyleQueryRegion.ts`)
- **Filter zadržavanja**: `viewport ∪ disk 185 km` (`flightFilterBounds.ts`) —
  **svi** izvori, uključujući lokalne prijemnike i retenciju
  (`mergeFlightsWithOpenSkyRetention`)
- **Screening filter kandidata**: 185 km (trenutna slant udaljenost aviona)
- **Transit-at-alignment filter**: 100 km (buduća slant udaljenost pri predviđenom poravnanju) — **ovo je granica fotografiranja**

Sve vrijednosti su namjerno različite. Ne miješati ih.

Zašto je screening širi od granice tranzita (2026-10-30): s dosegom vlastitog
prijemnika ~370 km filter od 100 km nepotrebno je rezao upozorenje. Avion
ulazi u 100 km prekasno — tranzit na 90 km bio je vidljiv ~45 s unaprijed, na
60 km ~3 min, iako predviđanje vrijedi 300 s. Prošireni disk ne pušta udaljenije
tranzite: korak 6 i dalje odbacuje sve što bi se dogodilo dalje od 100 km.
Web izvori i dalje dohvaćaju 100 km; dalje avione donosi samo lokalni prijemnik.

Filter zadržavanja **ne smije** biti goli viewport. Do 2026-08-25 su web izvori
filtrirali po uniji, a `localsdr`/`avionix` su dobivali samo `q.bounds`:
zumiranje karte (ono što se radi dok se cilja) izbacilo bi avione iz vlastitih
prijemnika, pa bi let pao na 30-sekundni web tempo ili nestao s karte i iz
kandidata. Kandidati, alerti i odbrojavanje ne smiju ovisiti o zumu.

Iz istog razloga `selectedFlightId` ima grace prozor od 20 s
(`SELECTION_GRACE_MS`, `moon-transit-store.ts`): jedan tick bez leta je čest i
prolazan, a trenutno otpuštanje selekcije usred odbrojavanja ugasi cijeli panel
s alatima (`usePhotographerTools` → `flightNotFound`).

### Zašto baš 80 km za vizualni prsten (floor vidljivosti)

Prsten od 80 km nije proizvoljan — to je **prva linija ispod koje kadar vrijedi
gledati u savršenim uvjetima**. Granica je postavljena na temelju stvarne
rezolucije, ne osjećaja:

- Tipičan putnički avion (raspon krila 40 m, `DEFAULT_WINGSPAN_M`) na 80 km ima
  kutnu veličinu `2·atan(40 / (2·80000))` ≈ **0.0286° ≈ 103″**.
- Pri 600 mm full-frame Mjesec (0.5° = 1800″) renderira se na **948 px**
  (`REFERENCE_MOON_DIAMETER_PX_AT_600MM_FULL_FRAME`), pa avion na 80 km zauzme
  **~54 px** širine i **~5.7 %** promjera Mjeseca — **jasno prepoznatljiva
  silueta** (detekcija "nešto je preletjelo" treba par px, prepoznavanje aviona
  ~20–30 px).
- Čisto rezolucijski 600 mm doseže i dalje (gola silueta čitljiva i preko
  100 km), ALI 80 km je točka gdje se poklapaju tri stvari: (a) prijelaz
  pokrivenosti iz "excellent" u "fair", (b) deklarirani baseline dosega
  120 km @ 600 mm postaje "fair" zona, i (c) geometrija počinje gurati avion u
  nisku elevaciju (na 80 km slant + 11 km visine elevacija je ~7.9°, tj.
  `caution` zona vidljivosti Mjeseca) gdje atmosferski seeing i izmaglica gutaju
  detalj.

Zaključak: prsten je **namjerno konzervativan** — granica "sve dalje od 80 km se
ne isplati ni gledati". Limitator iznad 80 km u praksi nije objektiv nego
atmosfera + niska elevacija. Brojevi: vidi `shotFeasibility.ts`
(`aircraftAngularSizeDeg`, `BASELINE_RANGE_M`, `moonDiameterPxAtReferenceSensor`).

---

# Prije pisanja nove komponente ili UI elementa

1. **Pronađi konkretan primjer** sličnog elementa u istom direktoriju (`grep`, `Read`). Ne oslanjaj se na opis iz Explore agenta — pročitaj stvarni kod.
2. **Provjeri kako shell okružuje sadržaj** — u ovom projektu rail/sheet panel već daje naslov i vizualni okvir. Komponente koje se renderiraju unutar `renderPanel()` vraćaju **goli sadržaj bez omotača** (`ShellSectionCard` ili sličnog). Dodavanje vlastitog omotača rezultira duplikacijom naslova i okvira.
3. **Primjer ispravnog uzorka** (iz `HomePageClient.tsx`): `CompassAimPanel` i `FieldOverlaysSection` vraćaju plain `<div>` — shell renderira naslov iz `MOBILE_PANEL_TITLES` / `RAIL_ITEMS` automatski.