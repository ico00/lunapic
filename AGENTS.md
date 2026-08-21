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

2. Trenutna slant udaljenost > 100 km  [screening.ts: MAX_SLANT_RANGE_METERS = 100_000]
   → isključen iz svega

3. Let se UDALJAVA od Mjeseca (30s lookahead)  [screening.ts: APPROACH_LOOKAHEAD_SEC = 30]
   → isključen iz svega
   (letovi bez speed/track prolaze bezuvjetno)

4. photographerPack.timeToAlignmentSec === null
   → isključen (azimut se nikad neće poravnati s Mjesecom, ILI se poravnanje
   predviđa dalje od `MAX_ALIGNMENT_LOOKAHEAD_SEC` = 300s
   [lineOfSightKinematics.ts: timeToAzimuthAlignmentSeconds] — iznad toga
   dead-reckoning s konstantnim track-om/brzinom postaje nepouzdan, pa je
   "willTransit" za takve letove lažno pozitivan)

5. |elevationGapAtAlignmentDeg| > halfVerticalFOV  (kamera-specifično)
   → isključen (neće stati u kadar)

6. futureSlantMeters > 100 km  [useTransitCandidates: MAX_TRANSIT_SLANT_METERS = 100_000]
   → isključen iz SVEGA — tranzit se predviđa predaleko od promatrača

7. Klasifikacija preživjelih:
   willTransit = |elevationGapAtAlignmentDeg| ≤ moonApparentRadius + aircraftAngularRadius
                                                                  [geometryEnginePhotographer.ts]
   → true  → "Disk transit" sekcija u panelu + okida alert
   → false → "In frame" sekcija (u kadru, ali ne prolazi disk)

8. Alert (useCandidateAlerts) — okida se SAMO za willTransit: true letove
```

**Zašto elevation gap umjesto 2D sky separation za `willTransit`:**
Linearni azimutalni model divergira za letove koji su trenutno daleko od Mjeseca (dugi lookahead). `separationAtAlignmentDeg` tada nije pouzdan. `elevationGapAtAlignmentDeg` je potvrđen kao pouzdan u stvarnom snimanju (2026-05-23).

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
povijesni, perzistiran u localStorage, više ne imenuje operatora), **LunaPic
ADS-B** (`localsdr`, Raspberry Pi) i **Avionix Nano ADS-B** (`avionix`, NanoPi
Neo — isti push princip kao Pi, vidi nižu sekciju za specifičnost uređaja).

Dvije stvari koje se lako slome i ne javljaju se same:

* **OpenSky traži OAuth2** (`OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`).
  Basic auth je ukinut i **tiho** se tretira kao anoniman pristup → 400 kredita
  dnevno po IP-u umjesto 4000. Krediti se troše **po zahtjevu**; preostalo stanje
  vraća se u `X-MoonTransit-OpenSky-Credits`.
* **Tempo je budžet, ne preferencija.** Web izvori 30 s
  (`LIVE_AUTO_REFRESH_MS`), Pi 10 s (`LOCALSDR_AUTO_REFRESH_MS`), Avionix
  10 s (`AVIONIX_AUTO_REFRESH_MS`), **sva tri stanu dok je tab skriven** —
  `useMoonTransitMap.ts`. Ne spajati ih natrag u jedan interval: prije je
  uključen Pi checkbox dizao i OpenSky na 10 s i trošio dnevnu kvotu za ~sat
  vremena.

Proxy rute `/api/adsbone/point`, `/api/localsdr/aircraft` i
`/api/avionix/aircraft` (pull grane) imaju circuit breaker — 3 uzastopna
neuspjeha → `503` + `Retry-After` (`src/lib/server/upstreamCircuitBreaker.ts`).

### Kako ADS-B podaci s Pija dolaze do servera (push, ne pull)

**Produkcija — Pi šalje.** Pi svakih 15 s (systemd timer) POST-a svoj
`aircraft.json` na `/api/localsdr/ingest` (auth: `x-sdr-token` =
`SDR_INGEST_TOKEN`). Ruta validira da je tar1090 JSON i atomično zapiše
`data/sdr-snapshot.json`. Čitaju ga `/api/localsdr/aircraft` i `server.js`
poller; snapshot stariji od 60 s smatra se mrtvim.

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
konzervativno veći disk. **Server-side scan** (`/api/transit/scan`) ne radi
index lookup pa uvijek koristi 40 m default.

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
- **Screening filter**: 100 km (trenutna slant udaljenost aviona)
- **Transit-at-alignment filter**: 100 km (buduća slant udaljenost pri predviđenom poravnanju)

Sve četiri vrijednosti su namjerno različite. Ne miješati ih.

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