# Tehnička specifikacija dizajna sustava (LunaPic) — baza za UI generator i redizajn

Verzija: izvorno stanje repozitorija (MoonTransit).  
**Napomena:** U kodu ne postoji komponenta pod imenom `MainShell`; glavni raspored i „ljuska” aplikacije implementirani su u `src/components/shell/HomePageClient.tsx` (telefon: `MobileShell.tsx`), uz orkestraciju u `src/hooks/useHomeShellOrchestration.ts`.

Ovaj dokument namjerno ide u **visoku granularnost** (CSS razredi, ID-ovi izvora karte, z-index, `data-testid`, ponašanje pri redizajnu) kako bi agent mogao mijenjati izgled bez lomljenja ponašanja.

---

## 1. Pregled arhitekture relevantan za UI

| Sloj | Uloga |
|-----|--------|
| `useMoonTransitStore` | Agregat stanja za vrijeme, ephemeru (izlaz/zlaz), kartu, letove, provider, odabir leta, OpenSky skew, kameru |
| `useObserverStore` | **Fiksna** geolokacija promatrača (ne centar karte); zaključavanje lokacije; fokus karte na promatrača; DEM sync |
| `GeometryEngine` | Čista domena (`lib/domain/geometry`): zrake/luk Mjeseca, presjeci, paralaksa, kinematika iz perspektive fotografa, izvedivi kadar |
| Shell | Mapbox preko cijelog viewporta, plohe iznad njega (§2b.5, §9) |

Koordinatni standard: **WGS84**. GeoJSON: `[longitude, latitude]`. Tipovi aplikacije: `{ lat, lng }`.

### 1.1 Pravila koja redizajn **ne smije** ignorirati (iz projektnih smjernica)

- **Observer-centric:** ephemera, paralaksa i letovi u domeni vezani su uz **`useObserverStore.observer`**, ne uz centar karte.
- **Mapbox:** svi izvori i slojevi moraju ostati pod kontrolom **`MapContainer.tsx`** (i hookova koje on poziva) — ne rasipati `map.addLayer` po panelima.
- **Jezik u UI copyju:** korisnički tekst u proizvodu na **engleskom** (npr. „Mission”, „Sync time to now”).
- **Dropdowni u shellu:** ne uvoditi nove native `<select>` u glavnom planiranju; koristiti **combobox** uzorak (portal, `z-[280]`).
- **Vrijeme:** `referenceEpochMs = timeAnchorMs + timeOffsetMs` (simulacija); `openSkyLatencySkewMs` samo za **real-time** ekstrapolaciju leta, ne za ephemeru.

---

## 2. Dizajn tokeni i globalni stil (`src/app/globals.css`)

Tokeni, tipografija i komponentni razredi opisani su u §2b. Ovdje ostaju samo elementi koji nisu dio dijagrama.

- **Golden flash:** `.golden-ui-flash-overlay`, `position: fixed`, `z-index: 200`, `pointer-events: none`, ~0.55 s, ispuna do 14 % `--moon`. Okida se kad je prvi put postignut „golden” alignment (§7).
- **Map loading:** `.mt-map-loading`, ravna `--land` ploha uz polagani `::after` prijelaz (isključen uz reduced motion). `data-testid="map-loading"` na placeholderu dok se `MapContainer` dinamički učitava.
- **Skala veličina:** u komponentama isključivo `text-[length:var(--fs-…)]`. Tailwind `text-xs/sm/base/lg` je zabranjen.
- **Iznimka, polja za unos na telefonu:** `max-md:text-[16px]`, jer iOS inače zumira stranicu pri fokusu.
- **Iznimka, instrumentalni mikrotekst:** kardinalne točke AR radara smiju koristiti fiksni `text-[0.45–0.55rem]` jer su dio crteža, ne teksta sučelja. Boje i tada idu preko tokena.

---

## 2b. Sustav „transit dijagram”

**Status.** Smjer je odobren na mockupu `documentation/redesign/home-mockup-v1.html` (naslovnica + stanja panela) i `documentation/redesign/pages-mockup-v1.html` (Flight log, About) i migriran je u kod (PR #53 i nastavak). Od starih naziva ostaju `--t-*` kao zamjena za `--ink*` i `.mt-glass-elevated` kao naziv za ravnu karticu (`--panel` + `--hair`).

**Ideja.** Tranzit se crta kao linija na dijagramu gradskog prijevoza. Stanica = prsten, poravnanje (presjecište) = veliki prsten s punom sredinom, linije se lome samo pod 45° i 90°. Odabrana linija gori najjače, ostalo se prigušuje. Ploča „Next transit” uvijek odgovara na: kad, koji avion, jesam li na liniji.

### 2b.1 Površine i zabrane

- Podloga je **ravna, neprozirna** tamnoplava (emajl). Zabranjeno: `backdrop-filter`/blur, vanjski sjaj (`box-shadow` bez offseta), gradijent kao dekoracija, gradijent teksta (`.mt-title`), `border-left` deblji od 1px na karticama/redovima.
- Jedini dozvoljeni gradijent: rampa visine u legendi (podatak, ne dekor).
- Panel: `border: 1px solid var(--hair)`, radijus `--r-panel` (10px). Kontrole: radijus `--r-ctl` (6px). Značke/tagovi: pill (999px). Nema drugih radijusa.
- Kartice samo za objekte koji su zasebni (ploča, Layers + legenda, traka vremena). Unutar ploče grupe se dijele hairlineom, ne novim karticama.

### 2b.2 Tokeni (`:root`)

| Token | Vrijednost | Uloga |
|---|---|---|
| `--ground` | `#0b1530` | Gornja traka, izbornik, tijelo stranice |
| `--ground-deep` | `#070e22` | Najdublja ploha, Moon disc podloga |
| `--land` | `#1b1d21` | Kopno na karti: **neutralni grafit, namjerno ne plavo** |
| `--panel` | `#111e40` | Ploče i kartice |
| `--panel-2` | `#182950` | Hover, odabran red, sekundarni gumb |
| `--hair` / `--hair-soft` | `#2c3f6e` / `#1f315e` | Obrub ploče / razdjelnici unutar ploče |
| `--ink` | `#eef3fa` | Primarni tekst (zamjena za `--t-primary`) |
| `--ink-2` | `#b8c4dc` | Sekundarni tekst (`--t-secondary`) |
| `--ink-3` | `#8a9abd` | Pomoćni tekst (`--t-tertiary`), min. 4.5:1 na `--panel` |
| `--moon` | `#ffb224` | **Samo Mjesec**: zraka, faza, rise/set, traka vidljivosti |
| `--observer` / `--observer-text` | `#5b95ff` / `#8db4ff` | Promatrač, „u kadru”, odabrano vrijeme |
| `--disc` / `--disc-text` | `#ff5d4a` / `#ff8d7e` | Prolaz preko diska, upozorenje o tranzitu |
| `--live` | `#34d17f` | Izvor uživo, dobro/spremno, „na liniji” |

**Granice na karti** su jedna oštra linija: Mapboxove podloge `admin-*-boundary-bg` (široke, zamućene) su isključene (`enamelBasemap.ts`) jer u našoj boji postaju siva traka koja pri zumu mijenja debljinu.

**Karta je siva, sučelje je plavo.** Podloga karte (`enamelBasemap.ts`) je neutralni grafit: kopno `#1b1d21`, voda `#0d0e11`, ceste `#2c2f36`/`#3d414a`, granice `#4b505b`, oznake `#8e939d`/`#c4c8cf`. Plava karta koja se stapa s plavim izbornikom i pločama gubi razliku između „alata” i „terena”, a boje na karti (amber, scarlet, cobalt) tek na neutralnoj podlozi nose značenje. Plavo smije biti samo sučelje i podatak (promatrač, u kadru).

**Tailwind skale** `sky`, `emerald`, `amber`, `rose` preslikane su u `globals.css` (`@theme`) na boje s fiksnim poslom (observer, live, moon, disc), a `violet` je neutralna plavosiva. Komponente ih više ne koriste za tekst, gumbe ni upozorenja nego tokene i `.mt-btn` / `.mt-note` / `.mt-chip` (§2b.5). Preslikavanje ostaje samo kao zaštita od novih klasa.

**Boja prati posao, ne ton poruke.** Amber je samo Mjesec: vidljivost, oblaci, faza, Moon napomene. Kvar izvora ili mala pokrivenost nisu Mjesec, pa su neutralni. U panelima je „prolazi preko diska” uvijek `--disc`, „u kadru / blizu” `--observer`, a spremno i uspjeh `--live`.

**Karta prati iste poslove:** shot-feasible avion, sve „stani ovdje” linije i potvrđena zona su `--live` (`#34d17f`), traka stajanja odabranog aviona i nesigurnost su `--observer` (`#5b95ff`). Street View crta aktivni tranzit u `--disc`, ostale kandidate u `--observer`, Mjesec u `--moon`.

**Serije podataka** (Flight log: odabrani zrakoplovi na karti): `--s1 #5b95ff`, `--s2 #34d17f`, `--s3 #eef3fa`. Najviše tri istovremeno; četvrta serija nije dozvoljena dok se ne doda token (`TRACK_COLORS`, klik na četvrti red ispiše „Up to 3 tracks at a time.”). Boja ostaje uz avion dok je odabran, i kad se drugi ukloni. Labela u legendi uvijek imenuje seriju, boja nikad nije jedini nositelj značenja.

Boje imaju **fiksan posao** i ne smiju se koristiti za dekoraciju ni za kategorije panela. Ljubičasta i ružičasta su ukinute. Tekst na bojom ispunjenim tagovima je tamni (`#1a0703` na `--disc`, `#06143a` na `--observer`) radi kontrasta.

### 2b.3 Tipografija

- Jedna obitelj: **Overpass** (400–800), uz `system-ui` fallback. Nema monospace fonta u sučelju: JetBrains Mono je uklonjen, jedino `FieldPerfOverlay` (dijagnostika) koristi sistemski `font-mono`. Brojke uvijek `font-variant-numeric: tabular-nums` (globalno na `body`).
- Skala (fiksna, ne fluidna): `--fs-display` 28, `--fs-h1` 22, `--fs-h2` 17, `--fs-body` 15, `--fs-meta` 13, `--fs-label` 12. `--fs-micro` (10px) se ukida: nijedan tekst ispod 12px.
- Naslovi su sentence case. **Nema** uppercase labela s razmakom slova iznad naslova (eyebrow). Jedina iznimka su nazivi grupa u izborniku (`NOW`, `SHOOT`, …) jer su dio navigacije.
- Pravilo iz AGENTS.md ostaje: u komponentama isključivo `text-[length:var(--fs-…)]` i `text-[color:var(--ink…)]` (mapiranje: `--t-primary`→`--ink`, `--t-secondary`→`--ink-2`, `--t-tertiary`→`--ink-3`).

### 2b.4 Dijagramski elementi

- **Stanica**: krug 15px, ispuna `--ground`, obrub 3.5px `--ink`. **Presjecište/poravnanje**: krug ~34px s obrubom 4px `--ink` i punom sredinom `--disc`.
- **Linija**: debljina 7–8px, `stroke-linecap: round`. Dijelovi: puna (stvarno), isprekidana (predviđeno/oprez), prigušena `#33466f` (nedostupno). Bez kandidata ploča crta istu liniju prigušenu i točkastu, od „Now” do „Prediction limit” (5 min, `MAX_ALIGNMENT_LOOKAHEAD_SEC`), bez presjecišta.
- Traka vidljivosti Mjeseca: puna = iznad 12°, isprekidana = 5–12° (`caution`), prigušena = ispod 5° (nema kandidata). Pragovi iz `moonFieldVisibilityAdvice.ts` ne mijenjaju se.
- Oznake stanica na traci vremena su ispod linije; oznaka koja bi se preklopila s oznakom „Now” (ili s prethodnom oznakom) prelazi iznad linije. Oznaka „Now” uvijek ostaje ispod (`MoonTimeLine.tsx`, `placeStationLabels`). Oznaka uz rub trake pomiče se unutra (`stationLabelShiftPx`) da ne izađe iz okvira.
- Cijela traka vremena prima pokazivač (`setPointerCapture`), a skriveni `input[type=range]` ostaje samo za tipkovnicu: na iOS-u se prozirni klizač pomiče samo s palca, koji se ne vidi.
- Na karti: Mjesečeva zraka `--moon` 3.5px; odabrani let `--disc` 4.5px, ostali `--observer` na 38% neprozirnosti; prsten 80 km isprekidan `--ink-3`.

### 2b.5 Komponente

- **Izbornik (rail)**, 200px, `--ground`: 12 panela u 5 grupa s oznakom grupe (prsten u boji grupe): *Now* (Transits, Candidates), *Shoot* (Photographer, Compass to Moon, Field overlays), *Sky and place* (Moon, Observer), *Feeds* (Flight source, Filters, Flight log), *Plan* (Transit forecast, Runway planning). Svaka stavka ima ikonu **i** tekst. Aktivna stavka = porculanska ispuna (`--ink` pozadina, `--ground` tekst). Registar panela (`panelRegistry.tsx`) dobiva polje `group`; `accent` se ukida.
- **Ploča (sheet)** na `left: 216px; top: 72px; width: 408px`. Izbornik bira što ploča prikazuje; zadano je „Next transit”. Svi paneli se otvaraju na istom mjestu, ne u zasebnom ladičaru s desne strane.
- **Tag**: 26px, pill, ispuna u boji klase (`DISC TRANSIT` = `--disc`, `IN FRAME` = `--observer`). Stanje bez kandidata je neutralno: `Watching`, ispuna `--panel-2`, obrub `--hair`.
- **Značka** (`.mt-chip`): 22px, pill, ispuna miješana s `--panel`, tekst u boji stanja. Modifikatori `.mt-chip-disc`, `-observer`, `-live`, `-moon`; bez modifikatora je neutralna. Za redove popisa i statuse (ocjena kadra, DISC / NEAR, pokrivenost, offline). Tag je samo za klasu prolaza na ploči.
- **Gumbi**: visina 42px, `--r-ctl`. Primarni = porculan (`--ink` ispuna). Sekundarni = `--panel-2` + `--hair` obrub. Stanje `:active` je `scale(0.97)`; hover samo unutar `@media (hover: hover) and (pointer: fine)`. Implementacija: klase `.mt-btn` (sekundarni), `.mt-btn-primary`, `.mt-btn-sm` (34px) u `globals.css`. Jedan primarni gumb po ploči (glavna radnja, npr. „Use my GPS”); ostali su sekundarni. Bez obojenih obruba, sjaja i `rounded-2xl`.
- **Polje za unos**: `.mt-field`, 42px, `--ground` ispuna, `--hair` obrub, fokus obrub `--observer`.
- **Segmentirani prekidač** (FT/KM, 24h/7d/…): `.mt-seg` (36px) ili `.mt-seg-sm` (24px), `aria-pressed` na gumbu, obrub `--hair`, aktivan segment porculan.
- **Redovi popisa**: min. 42px, ikona-stanica lijevo (prsten u boji klase, puni kad je odabran), vrijeme i domet desno poravnati.
- **Upozorenje**: ploha miješana iz boje stanja i `--panel` (`color-mix`), obrub u boji stanja, ikona + podebljani prvi dio rečenice. Primjer: oblaci 100 % uz dobru geometriju. Implementacija: `.mt-note` (zadano amber = Mjesec) uz `.mt-note-live`, `.mt-note-disc`, `.mt-note-observer`.
- Combobox i checkbox uzorci iz §4/§4a ostaju strukturno isti (portal, `z-[280]`), ali koriste `--panel-2`, `--hair`, `--observer`.
- **Gornja traka stranica** (`PageTopBar.tsx`, Flight log i About): 56px, logo, Planner, Flight log i About; aktivna stranica je porculan.
- **Fokus**: `outline: 2px solid var(--ink); outline-offset: 2px`.

### 2b.6 Pokret

- 120–150 ms, `cubic-bezier(0.23, 1, 0.32, 1)`, samo `transform`, `opacity`, boja. Nema ulaznih animacija stranice; odbrojavanje kuca svake sekunde bez animacije.
- `prefers-reduced-motion`: sve tranzicije isključene.

### 2b.7 Responzivnost

- Desktop (> 760px): gornja traka 56px, izbornik 200px, ploča, vremenska traka dolje, Layers (`left: 216px`) i legenda visine (`left: 300px`) dolje lijevo uz izbornik, `bottom: 6.25rem`. Ploča „Next transit” ostavlja ispod sebe 13rem da ih ne prekrije; otvoreni panel (`ToolSheet`) ih smije prekriti. Moon strip (kartica „Moon now” gore desno) je uklonjen — isti podaci su u panelu Moon i na traci vremena. Do 1280px se skrivaju sekundarne značke i manje oznake na traci.
- Telefon (`< md`, 768px; isti prag kao `useIsMdUp`): donja traka ima pet tabova, **Active, Candidates, Photo, Moon i More** (`MOBILE_TAB_PANELS`, `MobileShell.tsx`). Prva četiri otvaraju panel jednim dodirom, drugi dodir ga zatvara. More je popis svih ostalih panela po grupama izbornika, s About na dnu, a panel otvoren iz njega ima strelicu natrag. Brojčić na tabu: Active `--disc`, Candidates `--observer`; točka `--disc` na More kad vlastiti prijemnik ne odgovara. **Razlog:** grupe s izbornika stavile su najčešće panele dva dodira daleko i sakrile vrijeme, Layers i legendu, što je u terenu krivo (korisnička povratna informacija 2026-10-30).
- **Stalno vidljivo iznad donje trake**, odozgo prema dolje: uska ploča (`NextTransitBoard variant="strip"`), Layers + legenda visine, vremenska traka (`TimeRibbon compact`, 56px: sat, linija bez oznaka stanica, datum, Sync). Ciljevi dodira ≥ 42px.
- **Uska ploča** (min. 52px) daje odgovor u jednom retku: oznaka, odbrojavanje, avion, „On the line” ili „Off the line” s pomakom; bez kandidata „No transit in the next 5 minutes” i broj aviona. Dodir otvara cijelu ploču u `MobileSheet` (`variant="sheet"`). Puna ploča nije stalno otvorena jer uz vrijeme i legendu ostavlja premalo karte.
- Dok je vrijeme pomaknuto, sat na vremenskoj traci je u `--observer-text`, a ispod njega piše dan.
- Gornja traka na telefonu: logo, pretraga, oblaci. **Use my GPS, Set my location here i Focus on me** su stupac gumba desno gore, jedan dodir; Mapbox zoom je ispod njih.
- Dok je avion odabran, njegova kartica sjeda na mjesto uske ploče i legende. One su `invisible`, ne uklonjene, pa visina ostaje ista i karta se ne miče. Vremenska traka ostaje vidljiva.
- Karta se na telefonu pomiče tako da je promatrač iznad traka, ne ispod njih: `useMapBottomInset` postavlja Mapbox `padding`, a ne pomiče canvas, pa `flyTo` i „Set my location here” poštuju vidljivi dio. Visina se zaokružuje na 24px da sitne promjene ne miču kartu.

## 2b.8 Sadržaj i jezik

- **Mjesec ispod 5° (`CRITICAL_BELOW_DEG`): ploča se ne crta.** Prazna kartica „Moon below the usable horizon” je zauzimala pola karte bez korisne informacije; traka vremena pokazuje kad Mjesec prelazi 5°. Ostala prazna stanja (Loading, Planning mode, No transit) ostaju.
- Ploča odgovara redom: oznaka klase → naslov s odbrojavanjem („Moon crossing in 4:06”) → linija s vremenima → „Are you on the line?” (poprečni pomak i tolerancija iz `moonShadowSpot`) → domet, pokrivenost diska, ocjena kadra → akcije → ostali kandidati.
- Ocjena kadra prati §Shot feasibility: Excellent (< 80 km i pokrivenost > 10 %), Fair, Poor. Pokrivenost aviona na disku nikad se ne zaokružuje na „lijepu” brojku; mockup koristi A320 (35.8 m) na 62 km = 5.9 %.
- Bez kandidata ploča zadržava isti raspored: oznaka `Watching` → naslov „No transit in the next 5 minutes” → prigušena linija do granice predviđanja → visina, azimut i osvijetljenost Mjeseca. Odgovara i kad nema što javiti.
- Mjesec 5–12° (`caution`): ploča pokazuje `.mt-note` s visinom i upozorenjem o izmaglici.
- Jezik UI-ja je engleski (§1.1), i na Flight log stranici.
- **Vremena su lokalna.** Moonrise i Moonset su lokalni sat (HH:MM) za lokalni kalendarski dan simuliranog trenutka, UTC je u tooltipu (`title`). Dan bez izlaza ili zalaska je stvaran slučaj (lunarni dan ~24 h 50 min) i piše „None today”.
- **Izvor izlaza i zalaska je astronomy-engine** (`moonTimes.ts`), isti kao za položaj Mjeseca. Izmjereno za Zagreb, listopad 2026: stari SunCalc nema paralaksu i davao je izlaz p50 6 min, do 16 min drukčije od visine koju aplikacija prikazuje. Stari prozor UTC dana je na 6 od 31 dana prikazivao događaj susjednog lokalnog dana, pa sama promjena oznake ne bi bila točna.

---

## 4. Combobox (dropdown) — obvezan uzorak

Sažetak iz `documentation/technicalconventions.md` + implementacije:

- **Okidač:** tipka + chevron; **`data-testid`** i **`data-value`** za E2E (primjer: `flight-provider-select`).
- **Lista:** `createPortal(..., document.body)`, `position: fixed`, izračun iz `getBoundingClientRect()` (`top: bottom + 4px`, širina = trigger).
- **Stacking:** **`z-[280]`** da prelazi plohe s **`overflow-hidden`**.
- **Stil liste:** ravna ploha `--panel`, obrub `--hair`, radijus `--r-ctl`.
- **Obavezni izvor klasa (`src/lib/ui/shellComboboxStyles.ts`) — nikad kopirati string literale:**
  - okidač → `shellComboboxTriggerClass` (42px, `--ground` ispuna, `--hair` obrub, veličina `--fs-body`)
  - portal lista → `shellComboboxListboxPortalClass`
  - **redak opcije → `shellComboboxOptionClass(selected)`** — `--r-ctl`, `--fs-body`; selektirano `--panel-2` + `--observer-text`, inače hover `--panel-2`
- **Selekcija je uvijek `--observer`** — i u multi-selectu s checkboxom.
- **Reference:** `FlightProviderSelect.tsx`, `CameraSensorSelect.tsx`, `CameraPresetSelect.tsx`, `FlightFiltersPanel.tsx` (multi-select).

---

## 4a. Checkbox i toggle redovi u shellu

### 4a.1 `shellAccentCheckboxClass` (`src/lib/ui/shellComboboxStyles.ts`)

Jedini ovlašteni stil za `<input type="checkbox">`: 16px, obrub `--ink-3`, ispuna `--ground`; označeno = `--live` ispuna s tamnom kvačicom; fokus po §2b.5. `shellGlassCheckboxClass` je isti stil pod starim imenom.

### 4a.2 Label red s checkboxom (aktivno/neaktivno stanje)

Aktivni red: `--panel-2` + `--ink`. Neaktivan: `--ink-2`, hover `--panel-2`.

### 4a.2a Onemogućen red (izvor koji trenutno nije dostupan)

Red čiji se izvor ne može uključiti (npr. **Avionix Nano** dok uređaj nije spojen,
`AVIONIX_FEED_AVAILABLE = false`) ostaje na popisu, ali:

- checkbox je **`disabled`** i **nikad `checked`**; klase checkboxa ostaju
  `shellAccentCheckboxClass` uz `disabled:cursor-not-allowed` (zasivljenje daje red, ne checkbox);
- red nema ni on ni hover stanje: `cursor-not-allowed opacity-60`, tekst
  **`text-[color:var(--t-tertiary)]`**, bez hover pozadine;
- red nosi `title` s razlogom (npr. „Avionix Nano is not connected”) i
  `aria-disabled="true"`; bez brojača, bez „↑ priority”, bez „offline” bedža.

Zasivljenje je **jednom, na redu** (`opacity-60`), ne i na checkboxu — inače se
množi (0.6 × 0.6). `opacity-60` (a ne `text-zinc-600`) čuva čitljivost naziva i
radi isto na tekstu i na checkboxu.

### 4a.2b Grupe izvora u panelu Flight source

Redovi su podijeljeni u **dvije grupe**, uvijek ovim redoslijedom (redoslijed je
u `FlightSourcePanel.tsx`, ne u globalnom `FLIGHT_PROVIDER_COMBO_IDS`):

1. **Local receivers · no delay** — `LunaPic ADS-B`, `Avionix Nano` (vlastiti hardver, push).
2. **Web APIs · delayed** — `OpenSky`, `adsb.lol`, s jednom bilješkom ispod naslova
   da se osvježavaju svakih 30 s i kasne za lokalnim prijemnicima.

- Naslov grupe: **`.mt-section-label`** (§ tipografija), uz `px-2.5 pb-0.5`; između
  grupa jedan separator `border-t` u `--hair`.
- Bilješka: `text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]`, `px-2.5 pb-1`.
- Naslovi grupa su statični tekst, ne dio checkbox labela (ne mijenjaju stanje).

---

## 5. `useObserverStore` (`src/stores/observer-store.ts`)

Paralelan store — **obavezan** za razumijevanje shell panela i karte.

| Polje / akcija | Tip / ponašanje |
|----------------|-----------------|
| `observer` | `GroundObserver`: `lat`, `lng`, `groundHeightMeters` (GPS ili Mapbox DEM) |
| `mapFocusNonce` | Raste na **`requestFocusOnObserver`** → `MapContainer` / `useMoonTransitMap` radi `flyTo` na promatrača |
| `placeObserverFromViewNonce` | Raste na **`requestPlaceObserverFromView`** → map hook čita centar karte i poziva `setObserverFromMapView` |
| `observerLocationLocked` | Ako `true`, `setObserver` / `setObserverFromMapView` **ne** mijenjaju koordinate |
| `terrainGroundHeightSyncNonce` | Raste za ponovno povlačenje visine tla s Mapboxa |
| `requestTerrainGroundHeightSync()` | — |
| `setObserver(partial)` | Merge u `observer` (poštuje lock) |
| `setObserverFromMapView({ lat, lng })` | Samo horizontalno (poštuje lock) |
| `requestFocusOnObserver()` | Samo pogled karte |
| `requestPlaceObserverFromView()` | Centar viewa → observer |
| `setObserverLocationLocked(locked)` | — |

**UI veze:** gumbi „Set my location here” / „Focus on me”; GPS panel; zaključavanje lokacije u terenu.

---

## 6. `useMoonTransitStore` (`src/stores/moon-transit-store.ts`)

Zustand: `create<MoonTransitState>(…)`.

### 6.1 Konstante (izvoz)

- `TIME_SLIDER_WINDOW_MS` — jednako `UTC_DAY_MS` (~24 h civilni prozor klizača od sidra).

### 6.2 Stanje

| Polje | Tip | Semantika |
|-------|-----|-----------|
| `timeAnchorMs` | `number` | Sidro klizača (ms). **Sync** → `Date.now()`. Lijevi rub trake = ovaj trenutak. |
| `timeOffsetMs` | `number` | `0 … UTC_DAY_MS` od sidra. |
| `referenceEpochMs` | `number` | Efektivno simulirano „sada”. |
| `mapView` | `MapViewState` | Centar/zoom karte (ne mijenja observer osim kroz map hook). |
| `flightProvider` | `FlightProviderId` | Zadano `"opensky"`. |
| `flights` | `readonly FlightState[]` | Nakon merge-a s OpenSky retention. |
| `isLoading` | `boolean` | Učitavanje u granicama. |
| `error` | `string \| null` | Greška providera. |
| `selectedFlightId` | `string \| null` | Odabrani let (HUD, trajektorija, popup). |
| `openSkyLatencySkewMs` | `number` | ±120 s clamp; samo ekstrapolacija. |
| `cameraFocalLengthMm` | `number` | 50–2400, default 600. |
| `cameraSensorType` | `CameraSensorType` | `fullFrame \| apsC \| apsC16 \| microFourThirds` (crop × u `CAMERA_SENSOR_CROP`). |
| `cameraPresetId` | `string` | ID iz `CAMERA_PRESETS` u `src/lib/camera/cameraPresets.ts`; `other` = ručni senzor + rezolucija. |
| `cameraFrameWidthPx` | `number` | Aktivna širina izlaza u px (128–16384); fixed preseti je postavljaju iz preseta. |
| `cameraFrameHeightPx` | `number` | Aktivna visina izlaza u px (isto). |
| `moonRise` / `moonSet` | `Date \| null` | astronomy-engine za lokalni kalendarski dan (§2b.8). |
| `moonRiseSetKind` | `"normal" \| "alwaysUp" \| "alwaysDown"` | |
| `ephemerisRefetchKey` | `number` | Sync + prijelaz **lokalnog dana** na klizaču ili u živom vremenu. |

### 6.3 Akcije (sažeto)

`setSelectedFlightId`, `setOpenSkyLatencySkewMs`, `addOpenSkyLatencySkewMs`, `setCameraFocalLengthMm`, `setCameraSensorType`, `setCameraPresetId` (fixed → senzor + `cameraFrame*`; `other` → samo id), `setCameraFrameWidthPx`, `setCameraFrameHeightPx`, `setTimeOffsetMs` (novi lokalni dan → `ephemerisRefetchKey++`), `setMoonRiseSet` (reclamp reference uz anchor), `syncTimeToNow`, `setMapView`, `setFlightProvider` (čisti retention, reset selection), `setFlights`, `resetError`, `loadFlightsInBounds` (observer iz `useObserverStore`).

---

## 7. Orkestracija shella — javni API (`useHomeShellOrchestration`)

Hook vraća objekt koji `HomePageClient` prosljeđuje panelima. Pri redizajnu **komponente bi trebale i dalje primiti iste props** (ili supstitucija kroz jedan „view model” sloj).

| Ključ | Značenje |
|-------|----------|
| `flightProviderId`, `setFlightProvider`, `flightProvider` | Instanca `IFlightProvider` + id |
| `moon`, `isMoonBelowHorizon` | Izračun iz `useMoonStateComputed` + vidljivost |
| `moonRise`, `moonSet`, `moonRiseSetKind` | Iz storea |
| `isLoading`, `error` | Letovi |
| `selectedFlightId`, `setSelectedFlightId` | Odabir |
| `photoPack`, `photoShotFeasibility`, `photoUnavailableReason` | `usePhotographerTools` + GeometryEngine |
| `beepOnTransit`, `setBeepOnTransit` | Lokalni state — **Field sounds**: `useTransitBeep` (countdown) + `MapContainer` s `fieldSoundsEnabled` → `useTransitFieldSounds` (green-zone chime, moon-overlap hold tone) |
| `routeCorridor` | Opcionalno iz providera |
| `referenceEpochMs`, `timeOffsetMs` | Vrijeme |
| `offsetHours`, `setOffsetHours` | Traka vremena (sati kao float) |
| `syncTime` | Wrap na `syncTimeToNow` |
| `showEphemeris` | `false` do prvog layout mount + sync (sprječava flash „—”) |
| `moonDisplay`, `candidatesDisplay`, `showEmptyCandidates` | Maskirani prikazi dok ephemeris nije spreman |
| `activeTransits` | `useActiveTransits(0.5)` — prag ° za „blizu” |
| `isGolden` | `activeTransits.some(deltaAz < 0.1)` |
| `goldenFlashToken`, `setGoldenFlashToken` | Za `GoldenAlignmentFlash` |
| `nearestWindow` | `useNearestTransitWindow` |
| `obs`, `observerLocationLocked`, `requestFocusOnObserver` | Observer store |
| `onUseGps`, `gpsBusy`, `gpsError` | GPS |
| `sliderWidthHours` | Za `MoonTimeLine` |

**Golden pravilo:** „Golden” = **&lt; 0.1°** azimutne razlike u aktivnom tranzitu; `isGolden` ide u **`MapContainer`** za stil markera; flash ide u rootu `HomePageClient`.

---

## 8. `GeometryEngine` (domena)

Fasada: `src/lib/domain/geometry/geometryEngine.ts` → `geometryEngineMoonRay.ts`, `geometryEnginePhotographer.ts`, `shotFeasibility.ts`.

### 8.1 Tipovi

- `LatLng`, `RouteIntersection` (`geometryEngineTypes.ts`).

### 8.2 Moon ray (`geometryEngineMoonRay.ts`)

- `buildMoonAzimuthLine`, `buildMoonPathLineCoordinates`, `intersectMoonAzimuthWithStaticRoutes`, `buildOptimalGroundPathFeatures`.
- **Paralaksa** u ENU pri presjecima: `applyParallaxToEnu` (visina + elevacija Mjeseca).

### 8.3 Photographer (`geometryEnginePhotographer.ts`)

- `aircraftLineOfSightKinematics`, `photographerPack` (gap, rateovi, ETA poravnanja, `transitDurationMs`).

### 8.4 Shot feasibility (`shotFeasibility.ts`)

- Tieri `excellent | fair | poor`; slant range vs `maxShotRangeMetersForCamera` (bazno 120 km @ 600 mm full frame, skaliranje s efektivnom žarišnom).
- **Moon na izlazu:** promjer Mjeseca na referentnoj **6000 px** širini (`moonDiameterPxAtReferenceSensor`); za proizvoljni kadar `moonDiameterPxOnOutputFrame` + `moonFrameFillForOutputFrame` (postotak širine/površine) koriste **`cameraFrameWidthPx` / `cameraFrameHeightPx`** iz storea u `PhotographerToolsPanel`.

### 8.5 Disk Mjeseca u tražilu (`ViewfinderPreview.tsx`)

Disk je jedna statična tekstura punog Mjeseca (`public/moon-textures/nasa-full-moon.jpg`) maskirana lokalno izračunatim terminatorom — geometrija u `moonPhaseGeometry.ts`, bez mrežnog izvora.

| Odluka | Vrijednost | Zašto |
|---|---|---|
| Vidljivost neosvijetljene strane | `UNLIT_DISK_VISIBILITY = 0.15` | Potpuno crna tamna strana čitala se kao **rupa u kadru**, ne kao disk. Na 15 % se vidi cijeli obris Mjeseca, a osvijetljeni dio i dalje jasno dominira. |
| Boja maske | bijela s `fillOpacity` | Maske su luminance-based, a bijela ima luminanciju 1 u sRGB i linearRGB — `fillOpacity` daje istu vrijednost u svim preglednicima, za razliku od sivog hexa. |
| Orijentacija | `moonPhaseRotationDeg(χ, parallactic)` | Isti okvir kamere u kojem se već korigira kurs aviona. |

Silueta aviona (`#facc15` / `#fde047`) crta se **iznad** diska, pa je 15 % gornja granica — svjetlija tamna strana počinje jesti kontrast obrisa.

---

## 9. Shell (`HomePageClient.tsx`)

- **`useIsMdUp()`** — `matchMedia("(min-width: 768px)")`, početno `false` (SSR/hidratacija sigurna). Prag za desktop i telefon.
- Karta je `absolute inset-0`; sve ostalo su plohe iznad nje. Raspored i pragovi su u §2b.5 i §2b.7.
- Mobilni sadržaj panela: `data-testid="mobile-deck-content"`; donja traka: `data-testid="mobile-primary-nav"`, tabovi `mobile-shell-tab-<active|candidates|photo|moon|more>`, redovi popisa More `mobile-panel-row-<panel>`.

---

## 10. Vrijeme (`MoonTimeLine`, `TimeRibbon`)

- **Korak:** 1 minuta (`STEP_HOURS`).
- **Hydracija:** `useHasMounted` — labela „—” dok nije klijent (izbjegava mismatch datuma).
- **Horizon dim:** ako je Mjesec ispod horizonta i ephemeris spreman: `opacity-70`.
- **Prikaz vremena:** `referenceEpochMs` kao `toLocale*("en-GB", …)` sa `suppressHydrationWarning` gdje treba.
- `TimeRibbon` crta desktop karticu, a s `compact` nisku traku na telefonu (`MoonTimeLine dense`, bez oznaka stanica).

### 10.1 Planning date picker (time ribbon)

- **Uzorak:** ikonski gumb (`--r-ctl`) otvara **custom kalendar popup** po combobox uzorku (§4): `createPortal(..., document.body)`, `position: fixed`, **`z-[280]`**, ravna ploha `--panel` + `--hair`. Native `<input type="date">` je zabranjen — popup mu se ne može ni pozicionirati ni stilizirati (bježi ispod ruba na full-screenu). Referenca: `PlanningDateButton` + `PlanningCalendarPopup` u `HomePageClient.tsx`.
- **Pozicioniranje popupa (desktop, `md+`):** **iznad sidra** (`bottom = innerHeight − rect.top + 8`), desni rub poravnat s gumbom, clamp na rubove viewporta (`8px`). Širina 272 px.
- **Mobile (`<md`):** **full-screen modal** — backdrop `fixed inset-0 z-[280]`, `--ground-deep` na 80 %, kartica centrirana (`w-[min(22rem,100%)]`), dnevne ćelije povećane na `h-11 w-11` (touch target), dodatni ✕ gumb u headeru. Backdrop tap i Escape zatvaraju. Razlog: anchored popup se na malom ekranu miješa s altitude legendom i dockom.
- **Kalendar semantika:** tjedan počinje ponedjeljkom (`Mo…Su`); prošli dani disabled (`--t-disabled`); **danas** = prsten `--live`; **odabrani (planning) dan** = puna ispuna `--observer` (odabrano vrijeme, §2b.2); hover `--panel-2`. Mjesečna navigacija ne ide u mjesece prije tekućeg. Zatvaranje: klik izvan + Escape.
- **Pozicija:** na traci vremena između linije i Sync gumba (42px), i na desktopu i na telefonu.
- **Stanja:** neaktivno = `--panel-2` + `--hair`; **planning mode aktivan** = obrub `--observer`, tekst `--observer-text`.
- **Ograničenja:** `min` = današnji lokalni datum; odabir današnjeg (ili ranijeg) datuma = povratak u live (`syncTimeToNow`). Budući datum → `setTimeAnchorPlanned(lokalna ponoć)`.
- **Planning mode semantika:** store flag `timeAnchorIsPlanned`; `tickLiveTime` tada NE povlači sidro na now. Live-ovisni izračuni (kandidati, active transits, photographer) vraćaju prazno / reason `planningMode`; paneli prikazuju `.mt-note`. Ephemeris slojevi (Mjesec, putanja, koridor) rade normalno za odabrani dan.

### 10.2 Best hours (planning mode, Transit candidates panel)

- **Izvor:** `computeBestTransitHours` (`src/lib/domain/astro/bestTransitHours.ts`) — 24 satna uzorka (sredina sata): elevacija Mjeseca → `slant = (11 km − visina promatrača)/sin(elev)` → % promjera Mjeseca za default 40 m avion. Čisti ephemeris, bez live podataka.
- **Tierovi (konstante u istoj datoteci):** `great` ≥ 15 % diska (`--live` miješan s `--panel`), `ok` 8–15 % (`--moon` miješan s `--panel`, jer ocjenjuje visinu Mjeseca), `poor` < 8 % (`--panel-2`, tercijarni tekst), `belowHorizon` < 5° elevacije (prozirno).
- **Prikaz:** grid `grid-cols-8` (24 ćelije `h-8`, sat `HH`), legenda s tri točke, sažetak "Best around HH:00 …". Aktivni (simulirani) sat: prsten `--observer`.
- **Interakcija:** klik na sat → `setTimeOffsetMs` na **sredinu** tog sata (HH:30) — mapa/paneli skoče na taj trenutak. Renderira se samo u planning modeu, ispod amber napomene u `TransitCandidatesPanel`.

---

## 11. Karta — izvori i identifikatori (`src/lib/map/mapSourceIds.ts`)

Sve promjene vizuala na letovima / Mjesecu treba raditi kroz postojeće **source id**-eve (ili ih namjerno refaktorirati odjednom).

| Konstanta | Opis |
|-----------|------|
| `FLIGHTS_SOURCE` | GeoJSON zrakoplova |
| `FLIGHTS_LAYER_ID` | Circle layer (klik odabir) |
| `ROUTES_SOURCE` | Statičke rute |
| `MOON_AZ_SOURCE` | Azimut Mjeseca (simulacija) |
| `MOON_AZ_NOW_SOURCE` / `MOON_AZ_NOW_LABEL_SOURCE` | Trenutni azimut + label |
| `MOON_INT_SOURCE` | Presjeci zrak–ruta |
| `GROUND_OPTIMAL_SOURCE` | Optimal ground koridor |
| `MOON_PATH_*` | Puni dan / trenutak / labele luka |
| `SELECTED_STAND_SOURCE` / `SELECTED_STAND_SPINE_SOURCE` | Traka / spine za odabrani avion |
| `SELECTED_FLIGHT_TRAJECTORY_*` | Kratka predikcija putanje + label |
| `MAPBOX_TERRAIN_DEM_SOURCE` | DEM za elevaciju promatrača |
| `PHOTO_SPOT_SOURCE` / `PHOTO_SPOT_PATH_SOURCE` | „Gdje stati” prognoza iz Flight log panela: točka + elipsa tolerancije + krug rasipanja, i putanja sjene |
| `LIVE_SHADOW_SOURCE` / `LIVE_SHADOW_PATH_SOURCE` | Live centralna linija odabranog aviona + minutne oznake |
| `RUNWAY_PLAN_SOURCE` | Planning panel (LDZA): po jedna linija „stani ovdje” za svaki planirani trenutak i tok (prilaz 04 / odlazak 22), markeri pokrivenosti na 4/6/8/10/12 km i oznaka sata |

**MapContainer** također: `data-testid="map-surface"`; bez tokena `data-testid="map-missing-token"`. Popup klasa: `.moon-transit-aircraft-popup` (desktop `z-index: 20`; mobile `max-width: 767px` → **80**, iznad bottom tabova).

### 11.1 Boje i filtri na karti (konceptualno)

- **`shotFeasibleFlightIds`:** podskup letova koji prolaze screening + max domet kamere — koristi se za vizualno istaknuti „izvedive” markere.
- **`isGolden`:** prosljeđuje se u `useMoonTransitMap` za nisan / okvir markera.
- **„Gdje stati” slojevi:** **`--live`** = cijela obitelj „stani ovdje” — točka, elipsa tolerancije **i putanja sjene** s minutnim oznakama (`rgba(52,209,127,0.75)`, `dasharray [5,3]`, oznake `#a7f3d0`); **`--observer`** = nesigurnost (krug povijesnog rasipanja rute, `fill 0.10` / rub `0.35`). Tri mjerila namjerno se crtaju zajedno: elipsa je desetci metara, rasipanje stotine metara do kilometara — kontrast između njih **jest** poruka.
- **Amber je rezerviran za vlastito gibanje aviona** (`selected-flight-trajectory`, `#fde68a`, sitne crtice `[0.9,1.25]`, oznaka `+90s`) i za sat na luku Mjeseca. Putanja sjene je do 2026-08-23 bila amber isprekidana — ista boja **i** ista obitelj uzorka kao predikcija leta, pa se dvije linije o dva različita objekta nisu dale razlikovati na prvi pogled. Duge crtice su drugi znak, da razlika ne visi samo o boji.
- **Planning panel (`PlanningPanel`, id `planning`)** — planer za LDZA koji za odabrani dan/prozor/korak crta linije „stani ovdje” za virtualni A320 na prilazu 04 (3°, TCH 15 m) i odlasku 22 (gradijent 8 %). Cijela obitelj je **`--live`** (`#34d17f`, širina 4); tokovi se razlikuju **crticom, ne bojom**: prilaz = puna linija, odlazak = `line-dasharray [2,1.5]`. Svaka linija nosi bijelu oznaku sata (`HH:MM`, `en-GB`) na bližem kraju; marker (krug 4.5) na 4/6/8/10/12 km nosi pokrivenost u promjerima Mjeseca (`4.1×`, `#a7f3d0`) i oznaka se crta samo za fokusirani trenutak (ili za sve dok ništa nije fokusirano). Fokus = klik na redak u panelu, ostale linije padaju na `opacity 0.22` umjesto da nestanu. Odabir dana/vremena/koraka/veličine ide kroz `ShellSelect` (generički combobox, §4) — **native `<input type="date">` zabranjen** (§10.1). „Aircraft size” je **samo donja granica** (Any, ≥1×, ≥1.5×, ≥2×, ≥3× Mjeseca), bez gornje. Amber ostaje rezerviran za gibanje aviona/sat na luku Mjeseca, pa se ovdje koristi samo za upozorenja (Mjesec < 5°, skraćen popis). Izvor računa: `runwayShadowPlan.ts` (domena) — profili su pretpostavke i nose se u footnoteu panela. **Zadani prikaz = jedno vrijeme:** panel automatski fokusira prvi redak i na karti crta samo njega (deset skoro paralelnih linija na 10 min razmaka čitaju se kao jedna široka traka); kvačica „Show all times on the map” (`runwayPlanShowAll`) vraća sva vremena s prigušenjem neodabranih. Klik na redak u zadanom prikazu uvijek odabire; u show-all prikazu klik na odabrani redak skida fokus. **Uputa** („How to use”, `.mt-note-observer`) je sklopiva i pamti se u `localStorage` (`lunapic.planning.guideHidden`, uz try/catch). **„Days with the Moon up”:** idućih 30 dana, po danu osvijetljenost Mjeseca (značka: ≥85 % `--moon`, 50–85 % neutralna, ispod prigušena) i prozori u kojima je Mjesec ≥ 12° (`runwayPlanDays.ts`, `CAUTION_BELOW_DEG`); klik na prozor puni dan/od/do (prvih 90 min). Prvih 7 dana s prozorom, ostalo iza „Show all 30 days”. Panel se otvara na prvom prozoru od sada, ne na praznom danu. Pregled ne ocjenjuje stazu, vjetar ni promet.
- **Transit forecast panel (`TransitForecastPanel`, id `forecast`, grupa Plan)** — „Upcoming opportunities” (`/api/flight-log/transit-calendar`, idućih 14 dana) i „Where to stand” (`/api/flight-log/photo-spots`). Do 2026-10-29 bili su na dnu Flight loga; podaci dolaze iz loga, ali pitanje je planersko („kamo i kada ići”), pa su u Planu. Flight log zadržava samo povijest (tablica, tipovi, „Past transits”). Panel je standardne širine (408 px), ne `wide`. Značka u „Upcoming opportunities” je `POSSIBLE` (`.mt-chip-disc`) ili `NEAR`, nikad `DISC`: raspored ne daje dovoljnu točnost za tvrdnju da avion prolazi preko diska.
- **Značka pokrivenosti** (`PhotoSpotRow`, `TransitForecastPanel.tsx`): ≥ 50 % `.mt-chip-live`, 25–50 % `.mt-chip-observer`, < 25 % neutralna (dohvatljivo samo preko `closest` liste promašaja, koja ignorira prag). Klizač je **samo donja granica**, 25–150 %, default 25 — gore se ne filtrira ništa: avion širi od diska (prilazni promet redovito prelazi 150 %) je željeni rezultat, pa vrh klizača služi da se traže *samo* takvi.

---

## 12. Z-index referenca (redoslijed složenosti)

| Zona | z-index | Napomena |
|------|---------|----------|
| Combobox portal | 280 | Mora biti iznad bočnih kartica |
| Golden flash | 200 | Puni ekran |
| Header mobile | 78 | |
| MobileSheet | 75 | `absolute` |
| Mobilna donja traka (MobileTabBar) | 60 | `absolute bottom-0` |
| Ploča "Next transit"; stupac traka na telefonu | 15 | |
| Gumbi promatrača (telefon) | 14 | |
| Map aircraft popup (CSS klasa) | 20 | |

---

## 12a. Mobilni bottom layout — CSS varijable

**Nikad ne dodavaj `env(safe-area-inset-bottom)` direktno na `bottom` u komponentama iznad donje trake.** SAI je već uračunat u `--mobile-dock-h`; dodavanje ga zasebno u svakom elementu duplira pomak na pravim uređajima s home indicatorom (iPhone ≈ +34px).

Jedino mjesto gdje se SAI računa je `globals.css`:

```css
--mobile-dock-h:        calc(4rem + env(safe-area-inset-bottom, 0px));
--mobile-overlay-bottom: calc(var(--mobile-dock-h) + 0.5rem);
```

Stupac traka i `MobileSheet` koriste `bottom-[var(--mobile-overlay-bottom)]`. **Novi plutajući element iznad donje trake** koristi ovu varijablu ili gradi na njoj; ne uvoditi novu `calc(...+env(safe-area-inset-bottom))` konstantu.

---

## 12b. Mobilni popup aviona — pozicioniranje

`SelectedAircraftMapPopup` koristi Mapbox `Popup` s `anchor: "bottom"`. Sidrišna točka (u piksel-koordinatama map containera) računa se dinamički iz DOM-a, **ne** iz hardkodirane konstante:

```
sidrišna y = rect.height - mobileBottomUiHeightPx()
```

`mobileBottomUiHeightPx()` (`src/lib/map/selectedAircraftPopupAnchor.ts`) mjeri stvarnu visinu donje trake (`data-testid="mobile-primary-nav"`) i dodaje 72px: razmak 8, vremenska traka 56, razmak 8. Ako se visina vremenske trake promijeni, isti broj treba ažurirati ovdje. Kartica raste prema gore; dok je avion odabran, uska ploča i legenda su skrivene (§2b.7).

### Što NE raditi

- **Ne koristiti hardkodiranu konstantu** — vrijednost je bila pogrešna za prave uređaje s home indicatorom.
- **Ne dodavati `setOffset` nudge** — sidrište je točno, offset treba biti `[0, 0]`.
- **Ne čitati `padding-bottom` s roditeljskih elemenata** — map container nema relevantni padding.

---

### Animacija aviona na karti

- Prikazane pozicije i GeoJSON imaju zajednički minimalni interval **40 ms** (najviše 25 osvježavanja/s; stvarni tempo ovisi o frameovima i uređaju).
- Izračuni statusa tranzita koriste sirove fixove na field ticku; animirane pozicije služe prikazu.
- Odabrani avion, njegova kartica i predikcija putanje koriste izravnu ekstrapolaciju istog fixa kao Photographer brojač, bez dodatnog filtra sustizanja. Animacija između fixova ostaje; novi fix odmah korigira poziciju. Glađenje ostalih markera ne smije se koristiti kao ulaz za brojač.
- ATC oznake, spojnice i predikcije obnavljaju se samo u ATC modu.
- Animacijski rAF miruje dok je dokument skriven; tempo dohvaćanja ADS-B podataka ostaje neovisan.

---

## 13. Pristupačnost i E2E

- Novi kontroli u shellu: dodati **`data-testid`** gdje je logično za Playwright (`e2e/`).
- `prefers-reduced-motion`: poštovati za animacije (golden flash, toolbar scale, map shimmer).

---

## 14. Checklist za agenta pri redizajnu

1. [ ] Zadržati 12 panela i 5 grupa (§2b.5); ploča „Next transit” odgovara bez otvaranja panela.
2. [ ] Ne premještati **Mapbox** logiku iz `MapContainer` / `useMapGeoJsonSync` u panele.
3. [ ] Bilo koji novi picker u shellu → **combobox** + portal + `z-[280]`.
4. [ ] Tekst u UI na engleskom; format vremena dosljedan (`en-GB` gdje je već korišten).
5. [ ] `observer` vs **centar karte** — ne zamijeniti u copyju ili vizualnim hintovima.
6. [ ] Golden prag **0.1°** i flash ponašanje ostaju produktno pravilo osim ako se eksplicitno mijenja specifikacija proizvoda.
7. [ ] Nakon većih UI promjena: `npm run lint`, `npm run test:run`, `npm run build`, `npx tsc --noEmit`, po potrebi Playwright.

---

## 15. Referentne datoteke (prošireno)

| Tema | Put |
|------|-----|
| Globalni stil | `src/app/globals.css` |
| Layout / fontovi | `src/app/layout.tsx` |
| Shell layout | `src/components/shell/HomePageClient.tsx` |
| Telefon | `src/components/shell/MobileShell.tsx` |
| Gornja traka stranica | `src/components/shell/PageTopBar.tsx` |
| Golden flash | `src/components/shell/GoldenAlignmentFlash.tsx` |
| Karta | `src/components/map/MapContainer.tsx` |
| GeoJSON sync | `src/hooks/useMapGeoJsonSync.ts` |
| Map izvori | `src/lib/map/mapSourceIds.ts` |
| Orkestracija | `src/hooks/useHomeShellOrchestration.ts` |
| Breakpoint | `src/hooks/useMediaQuery.ts` |
| Storeovi | `src/stores/moon-transit-store.ts`, `src/stores/observer-store.ts` |
| GeometryEngine | `src/lib/domain/geometry/geometryEngine.ts` |
| Faza Mjeseca (tražilo) | `src/lib/domain/astro/moonPhaseGeometry.ts`, `src/components/field/ViewfinderPreview.tsx` |
| Konvencije | `documentation/technicalconventions.md`, `documentation/architecture.md` |
