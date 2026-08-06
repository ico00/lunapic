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