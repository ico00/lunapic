# Tehnička specifikacija dizajna sustava (LunaPic) — baza za UI generator i redizajn

Verzija: izvorno stanje repozitorija (MoonTransit).  
**Napomena:** U kodu ne postoji komponenta pod imenom `MainShell`; glavni desktop raspored i „ljuska” aplikacije implementirani su u `src/components/shell/HomePageClient.tsx`, uz orkestraciju u `src/hooks/useHomeShellOrchestration.ts`.

Ovaj dokument namjerno ide u **visoku granularnost** (CSS razredi, ID-ovi izvora karte, z-index, `data-testid`, ponašanje pri redizajnu) kako bi agent mogao mijenjati izgled bez lomljenja ponašanja.

---

## 1. Pregled arhitekture relevantan za UI

| Sloj | Uloga |
|-----|--------|
| `useMoonTransitStore` | Agregat stanja za vrijeme, ephemeru (izlaz/zlaz), kartu, letove, provider, odabir leta, OpenSky skew, kameru |
| `useObserverStore` | **Fiksna** geolokacija promatrača (ne centar karte); zaključavanje lokacije; fokus karte na promatrača; DEM sync |
| `GeometryEngine` | Čista domena (`lib/domain/geometry`): zrake/luk Mjeseca, presjeci, paralaksa, kinematika iz perspektive fotografa, izvedivi kadar |
| Shell (desktop) | CSS grid: lijevi stupac (misija), sredina (Mapbox), desni stupac (teren/foto alati) |

Koordinatni standard: **WGS84**. GeoJSON: `[longitude, latitude]`. Tipovi aplikacije: `{ lat, lng }`.

### 1.1 Pravila koja redizajn **ne smije** ignorirati (iz projektnih smjernica)

- **Observer-centric:** ephemera, paralaksa i letovi u domeni vezani su uz **`useObserverStore.observer`**, ne uz centar karte.
- **Mapbox:** svi izvori i slojevi moraju ostati pod kontrolom **`MapContainer.tsx`** (i hookova koje on poziva) — ne rasipati `map.addLayer` po panelima.
- **Jezik u UI copyju:** korisnički tekst u proizvodu na **engleskom** (npr. „Mission”, „Sync time to now”).
- **Dropdowni u shellu:** ne uvoditi nove native `<select>` u glavnom planiranju; koristiti **combobox** uzorak (portal, `z-[280]`).
- **Vrijeme:** `referenceEpochMs = timeAnchorMs + timeOffsetMs` (simulacija); `openSkyLatencySkewMs` samo za **real-time** ekstrapolaciju leta, ne za ephemeru.

---

## 2. Dizajn tokeni i globalni stil (`src/app/globals.css`)

### 2.1 CSS varijable (`:root`)

| Varijabla | Vrijednost | Namjena |
|-----------|------------|---------|
| `--background` | `#050508` | Baza tamne pozadine |
| `--foreground` | `#e4e4e7` | Tekst (zinc-200 zona) |
| `--mt-glow-a` | `rgba(16, 185, 129, 0.11)` | **Emerald** radial u pozadinskoj atmosferi |
| `--mt-glow-b` | `rgba(56, 189, 248, 0.08)` | **Sky** radial |
| `--mt-glow-c` | `rgba(251, 191, 36, 0.06)` | **Amber** radial |
| `--fs-micro` | `10px` | Count badge / mikrotekst (vidi §2.6) |

### 2.2 Pozadina aplikacije

- **`body`:** `mt-app-bg` — tri radijala (emerald / sky / amber) + vertikalni gradijent prema `#050508`.
- **`main`:** `mt-app-bg-main` — `isolation: isolate`, `z-index: 0`.

### 2.3 Komponentni razredi (`@layer components`)

| Razred | Bitno za redizajn |
|--------|-------------------|
| `.mt-title` | Font: **Outfit** (fallback Geist Sans). Gradijent teksta: `#fafafa → #a7f3d0 → #7dd3fc`; `background-clip: text`; transparentna boja ispune. |
| `.mt-subtitle` | `text-zinc-500`, `text-pretty` |
| `.mt-chrome-bar` | `border-b border-white/[0.07]`, `bg-zinc-950/75`, blur, lagani inset sjene |
| `.mt-side-rail` | Bočne trake: `bg-zinc-950/55`, `border-white/[0.06]`, `backdrop-blur-2xl`, unutarnji highlight |
| `.mt-toolbar-btn` | `h-9`, `rounded-xl`, `border-white/[0.08]`, `bg-zinc-900/40`, hover/active scale (osim `prefers-reduced-motion`) |
| `.mt-toolbar-btn:focus-visible` | `ring-2 ring-emerald-500/50`, `ring-offset-zinc-950` |
| `.mt-toolbar-btn-primary` | Emerald border/amber tekst — primarni CTA u toolbaru |
| `.mt-section-label` | Outfit, **`var(--fs-label)`** (12px), **uppercase**, `tracking-[0.12em]`, `color: var(--t-secondary)` |
| `.mt-section-label-emerald` | Isto, ali `text-emerald-400/85` (npr. Photographer sekcija) |
| `.mt-glass-elevated` | (uz `@supports(backdrop-filter)`) gradijent + `blur(20px)` + inset highlight — za floating kartice |

### 2.4 Golden flash (poravnanje)

- Klasa **`.golden-ui-flash-overlay`**: `position: fixed`, `inset: 0`, **`z-index: 200`**, `pointer-events: none`, animacija `golden-ui-flash` (~0.55s, zeleni wash do ~16% opacity).
- Okida se kad je prvi put postignut **„golden”** alignment (vidi §6.2).

### 2.5 Map loading

- **`.mt-map-loading`**: tamni gradijent + **`::after`** shimmer (emerald/sky traka, animacija `mt-shimmer`; isključena uz reduced motion).
- `data-testid="map-loading"` na placeholderu dok se `MapContainer` dinamički učitava.

### 2.6 Tipografija (Next font, `layout.tsx`)

- **`--font-geist-sans`**, **`--font-geist-mono`**, **`--font-outfit`** (Outfit težine 500–700).
- Shell naslovi / label klase preferiraju **Outfit**; numerički readouti često **`font-mono`** + `tabular-nums`.
- **Skala veličina — jedini dopušteni tokeni** (`globals.css`): `--fs-display`, `--fs-h1`, `--fs-h2`, `--fs-body` (15.5px), `--fs-body-strong` (16px), `--fs-meta` (13px), `--fs-label` (12px), `--fs-micro` (10px). U komponentama **isključivo** `text-[length:var(--fs-…)]` — Tailwind `text-xs/sm/base/lg` je zabranjen.
- **`--fs-micro`** je rezerviran za count badge (dock/rail brojčić) — nikad za čitljivi sadržaj.
- **Iznimka — instrumentalni mikrotekst:** oznake unutar grafike instrumenta (kompas ruža N/E/S/W ticks, AR radar disc kardinalne točke) smiju koristiti fiksni `text-[0.45–0.55rem]` jer su dio crteža, ne teksta sučelja. Boje i tada idu preko tokena (`--t-secondary` / `--t-tertiary`) ili semantičkog akcenta (amber za N).

### 2.7 Paleta u praksi (Tailwind)

 dominantno **zinc** (pozadina, tekst), **emerald** (uspjeh, sync, prsten fokusa), **amber** (lokacija / upozorenja / time accent), **sky** (sekundarni naglasci, „focus on me”). **Rose / violet / lime** dostupni kao **accent linija** na `ShellSectionCard` (ne nužno u cijeloj UI).

---

## 2b. Redizajn v2: „transit dijagram” (smjer odobren na mockupu, kod još nije migriran)

**Status.** Smjer je odobren na mockupu `documentation/redesign/home-mockup-v1.html` (naslovnica + stanja panela) i `documentation/redesign/pages-mockup-v1.html` (Flight log, About). Dok se kod ne migrira, §2.1–2.7 i §3 i dalje opisuju produkciju. Pri migraciji ova sekcija **zamjenjuje** §2.1–2.7; stare tokene (`--glass-*`, `--aurora`, `.mt-glass-elevated`, `.mt-title` gradijent) treba ukloniti, ne držati uz nove.

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

**Tailwind skale** `sky`, `emerald`, `amber`, `rose` preslikane su u `globals.css` (`@theme`) na boje s fiksnim poslom (observer, live, moon, disc), a `violet` je neutralna plavosiva. Nova komponenta ne koristi te klase za gumbe i upozorenja nego `.mt-btn` / `.mt-note` (§2b.5).

**Serije podataka** (Flight log: odabrani zrakoplovi na karti): `--s1 #5b95ff`, `--s2 #34d17f`, `--s3 #eef3fa`. Najviše tri istovremeno; četvrta serija nije dozvoljena dok se ne doda token. Labela u legendi uvijek imenuje seriju, boja nikad nije jedini nositelj značenja.

Boje imaju **fiksan posao** i ne smiju se koristiti za dekoraciju ni za kategorije panela. Ljubičasta (`--aurora`) i ružičasta (`--rose`) se ukidaju. Tekst na bojom ispunjenim tagovima je tamni (`#1a0703` na `--disc`, `#06143a` na `--observer`) radi kontrasta.

### 2b.3 Tipografija

- Jedna obitelj: **Overpass** (400–800), uz `system-ui` fallback. Zamjenjuje Outfit + Geist u UI-ju. Brojke uvijek `font-variant-numeric: tabular-nums` (globalno na `body`).
- Skala (fiksna, ne fluidna): `--fs-display` 28, `--fs-h1` 22, `--fs-h2` 17, `--fs-body` 15, `--fs-meta` 13, `--fs-label` 12. `--fs-micro` (10px) se ukida: nijedan tekst ispod 12px.
- Naslovi su sentence case. **Nema** uppercase labela s razmakom slova iznad naslova (eyebrow). Jedina iznimka su nazivi grupa u izborniku (`NOW`, `SHOOT`, …) jer su dio navigacije.
- Pravilo iz AGENTS.md ostaje: u komponentama isključivo `text-[length:var(--fs-…)]` i `text-[color:var(--ink…)]` (mapiranje: `--t-primary`→`--ink`, `--t-secondary`→`--ink-2`, `--t-tertiary`→`--ink-3`).

### 2b.4 Dijagramski elementi

- **Stanica**: krug 15px, ispuna `--ground`, obrub 3.5px `--ink`. **Presjecište/poravnanje**: krug ~34px s obrubom 4px `--ink` i punom sredinom `--disc`.
- **Linija**: debljina 7–8px, `stroke-linecap: round`. Dijelovi: puna (stvarno), isprekidana (predviđeno/oprez), prigušena `#33466f` (nedostupno).
- Traka vidljivosti Mjeseca: puna = iznad 12°, isprekidana = 5–12° (`caution`), prigušena = ispod 5° (nema kandidata). Pragovi iz `moonFieldVisibilityAdvice.ts` ne mijenjaju se.
- Oznake stanica na traci vremena su ispod linije; oznaka koja bi se preklopila s oznakom „Now” (ili s prethodnom oznakom) prelazi iznad linije. Oznaka „Now” uvijek ostaje ispod (`MoonTimeLine.tsx`, `placeStationLabels`).
- Na karti: Mjesečeva zraka `--moon` 3.5px; odabrani let `--disc` 4.5px, ostali `--observer` na 38% neprozirnosti; prsten 80 km isprekidan `--ink-3`.

### 2b.5 Komponente

- **Izbornik (rail)**, 200px, `--ground`: 12 panela u 5 grupa s oznakom grupe (prsten u boji grupe): *Now* (Transits, Candidates), *Shoot* (Photographer, Compass to Moon, Field overlays), *Sky and place* (Moon, Observer), *Feeds* (Flight source, Filters, Flight log), *Plan* (Transit forecast, Runway planning). Svaka stavka ima ikonu **i** tekst. Aktivna stavka = porculanska ispuna (`--ink` pozadina, `--ground` tekst). Registar panela (`panelRegistry.tsx`) dobiva polje `group`; `accent` se ukida.
- **Ploča (sheet)** na `left: 216px; top: 72px; width: 408px`. Izbornik bira što ploča prikazuje; zadano je „Next transit”. Svi paneli se otvaraju na istom mjestu, ne u zasebnom ladičaru s desne strane.
- **Tag**: 26px, pill, ispuna u boji klase (`DISC TRANSIT` = `--disc`, `IN FRAME` = `--observer`).
- **Gumbi**: visina 42px, `--r-ctl`. Primarni = porculan (`--ink` ispuna). Sekundarni = `--panel-2` + `--hair` obrub. Stanje `:active` je `scale(0.97)`; hover samo unutar `@media (hover: hover) and (pointer: fine)`. Implementacija: klase `.mt-btn` (sekundarni), `.mt-btn-primary`, `.mt-btn-sm` (34px) u `globals.css`. Jedan primarni gumb po ploči (glavna radnja, npr. „Use my GPS”); ostali su sekundarni. Bez obojenih obruba, sjaja i `rounded-2xl`.
- **Polje za unos**: `.mt-field`, 42px, `--ground` ispuna, `--hair` obrub, fokus obrub `--observer`.
- **Segmentirani prekidač** (FT/KM, 24h/7d/…): obrub `--hair`, aktivan segment porculan.
- **Redovi popisa**: min. 42px, ikona-stanica lijevo (prsten u boji klase, puni kad je odabran), vrijeme i domet desno poravnati.
- **Upozorenje**: ploha miješana iz boje stanja i `--panel` (`color-mix`), obrub u boji stanja, ikona + podebljani prvi dio rečenice. Primjer: oblaci 100 % uz dobru geometriju. Implementacija: `.mt-note` (zadano amber = Mjesec) uz `.mt-note-live`, `.mt-note-disc`, `.mt-note-observer`.
- Combobox i checkbox uzorci iz §4/§4a ostaju strukturno isti (portal, `z-[280]`, sky = odabir), ali koriste `--panel-2`, `--hair`, `--observer`.
- **Fokus**: `outline: 2px solid var(--ink); outline-offset: 2px`.

### 2b.6 Pokret

- 120–150 ms, `cubic-bezier(0.23, 1, 0.32, 1)`, samo `transform`, `opacity`, boja. Nema ulaznih animacija stranice; odbrojavanje kuca svake sekunde bez animacije.
- `prefers-reduced-motion`: sve tranzicije isključene.

### 2b.7 Responzivnost

- Desktop (> 760px): gornja traka 56px, izbornik 200px, ploča, vremenska traka dolje, Layers (`left: 216px`) i legenda visine (`left: 300px`) dolje lijevo uz izbornik, `bottom: 6.25rem`. Ploča „Next transit” ostavlja ispod sebe 13rem da ih ne prekrije; otvoreni panel (`ToolSheet`) ih smije prekriti. Moon strip (kartica „Moon now” gore desno) je uklonjen — isti podaci su u panelu Moon i na traci vremena. Do 1280px se skrivaju sekundarne značke i manje oznake na traci.
- Telefon (≤ 760px): izbornik postaje donja traka s 5 grupa (*Now, Shoot, Sky, Feeds, Plan*), ploča postaje donji panel (`max-height: 70%`), legenda i traka vremena se otvaraju iz grupa. Ciljevi dodira ≥ 42px.
- Karta se na telefonu pomiče tako da je promatrač iznad ploče, ne ispod nje.

### 2b.8 Sadržaj i jezik

- **Mjesec ispod 5° (`CRITICAL_BELOW_DEG`): ploča se ne crta.** Prazna kartica „Moon below the usable horizon” je zauzimala pola karte bez korisne informacije; traka vremena pokazuje kad Mjesec prelazi 5°. Ostala prazna stanja (Loading, Planning mode, No transit) ostaju.
- Ploča odgovara redom: oznaka klase → naslov s odbrojavanjem („Moon crossing in 4:06”) → linija s vremenima → „Are you on the line?” (poprečni pomak i tolerancija iz `moonShadowSpot`) → domet, pokrivenost diska, ocjena kadra → akcije → ostali kandidati.
- Ocjena kadra prati §Shot feasibility: Excellent (< 80 km i pokrivenost > 10 %), Fair, Poor. Pokrivenost aviona na disku nikad se ne zaokružuje na „lijepu” brojku; mockup koristi A320 (35.8 m) na 62 km = 5.9 %.
- Jezik UI-ja je engleski (§1.1). **Flight log stranica trenutno ima hrvatske labele** (npr. „Ukupno pozicija”); pri migraciji ih treba ujednačiti na engleski.
- Vremena su lokalna; dosadašnji „UTC day” prikaz rise/set zamjenjuje se lokalnim vremenom (uz UTC u tooltipu).

---

## 3. Kartice sekcija i footnote (`ShellSectionCard.tsx`)

### 3.1 `ShellSectionAccent`

Vrste: `sky | emerald | amber | rose | violet | lime | zinc`.  
Svaka mapira na **1px gradijent** (`bg-gradient-to-r`) na vrhu kartice (`from-*-500/…` → transparent).

### 3.2 `SectionCardSurface` (omot bez naslova)

- Oblik: `rounded-2xl`, `border border-white/[0.09]`, vertikalni gradijent `from-zinc-900/55 to-zinc-950/95`, `p-3.5`, duboka sjena, `ring-1 ring-inset ring-white/[0.05]`.
- **`overflow-hidden`** na sekciji — pri dodavanju sadržaja koji treba scroll, scroll ide na **unutarnji** wrapper, ne na sekciju ako želite zadržati clipping sjene.

### 3.3 `ShellSectionCard`

- Props: `title`, opcionalno `icon`, `accent`, `titleTone: "default" | "emerald"`, `className`.
- Naslov: `h2` s `aria-labelledby`; default label = `.mt-section-label` + donji border; emerald tone = `.mt-section-label-emerald`.
- Sadržaj: omot `div.mt-3.min-w-0`.

### 3.4 `ShellFootnote`

- Isprekidani okvir: `border-dashed border-zinc-600/40`, `bg-zinc-950/35`, `text-xs text-zinc-500` — za kratke napomene (npr. ispod misije).

### 3.5 Razmak panela u stupcima

Paneli u `HomePageClient` obično su u fragmentu bez eksplicitnog `space-y`; pojedini paneli unutra koriste `mt-3`, `space-y-3`, itd. Pri redizajnu **zadržati čitljiv vertical rhythm** (npr. `space-y-4` na roditelju stupca ako se ujednačava).

---

## 4. Combobox (dropdown) — obvezan uzorak

Sažetak iz `documentation/technicalconventions.md` + implementacije:

- **Okidač:** tipka + chevron; **`data-testid`** i **`data-value`** za E2E (primjer: `flight-provider-select`).
- **Lista:** `createPortal(..., document.body)`, `position: fixed`, izračun iz `getBoundingClientRect()` (`top: bottom + 4px`, širina = trigger).
- **Stacking:** **`z-[280]`** da prelazi `ShellSectionCard` **`overflow-hidden`**.
- **Stil liste:** staklo — npr. `border-white/10`, `bg-zinc-900/95`, `backdrop-blur-md`; opcije s sky hover/selected stanjima.
- **Obavezni izvor klasa (`src/lib/ui/shellComboboxStyles.ts`) — nikad kopirati string literale:**
  - okidač → `shellComboboxTriggerClass` (veličina `--fs-body`, boja `--t-primary`)
  - portal lista → `shellComboboxListboxPortalClass`
  - **redak opcije → `shellComboboxOptionClass(selected)`** — `rounded-md`, `--fs-body`; selektirano `bg-sky-500/20 text-sky-200`, inače hover `bg-white/[0.08]`
- **Selekcija je uvijek sky** — i u multi-selectu s checkboxom. `violet` / `rose` / `lime` su rezervirani za accent liniju `ShellSectionCard` (§2.7), nikad za stanje opcije.
- **Reference:** `FlightProviderSelect.tsx`, `CameraSensorSelect.tsx`, `CameraPresetSelect.tsx`, `FlightFiltersPanel.tsx` (multi-select).

---

## 4a. Checkbox i toggle redovi u shellu

### 4a.1 `shellAccentCheckboxClass` (`src/lib/ui/shellComboboxStyles.ts`)

Jedini ovlašteni stil za `<input type="checkbox">` unutar shell panela:

```
h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-900
text-sky-500 accent-sky-500          ← tick boja: sky (sekundarni akcent)
outline-none focus:ring-2 focus:ring-emerald-500/50   ← fokus ring: emerald (§2.3)
```

**Pravilo:** nikad ne koristiti `blue-*` za tick/accent ni za fokus ring. Paleta ne sadržava `blue`; sekundarni akcent = **sky**, fokus ring = **emerald**.

### 4a.2 Label red s checkboxom (aktivno/neaktivno stanje)

```ts
const on  = `... bg-sky-500/15 text-sky-200`;   // uključeno
const off = `... text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50`; // isključeno
```

- Aktivni red: **`bg-sky-500/15`** + **`text-sky-200`** — ne `blue`, ne `yellow`.
- `yellow-*` nije u paleti; za akcent teksta koristiti **`amber-*`** (lokacija/upozorenja) ili **`sky-*`** (selekcija/toggle).

### 4a.3 Combobox trigger hover/fokus

```
hover:border-sky-500/35   ← sky (ne blue)
focus:ring-emerald-500/50 ← emerald (ne blue)
```

Referenca implementacija: `FlightSourcePanel.tsx`, `FlightProviderSelect.tsx`, `shellComboboxStyles.ts`.

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
| `moonRise` / `moonSet` | `Date \| null` | suncalc za kalendar dan konteksta. |
| `moonRiseSetKind` | `"normal" \| "alwaysUp" \| "alwaysDown"` | |
| `ephemerisRefetchKey` | `number` | Sync + prijelaz **UTC dana** na klizaču. |

### 6.3 Akcije (sažeto)

`setSelectedFlightId`, `setOpenSkyLatencySkewMs`, `addOpenSkyLatencySkewMs`, `setCameraFocalLengthMm`, `setCameraSensorType`, `setCameraPresetId` (fixed → senzor + `cameraFrame*`; `other` → samo id), `setCameraFrameWidthPx`, `setCameraFrameHeightPx`, `setTimeOffsetMs` (UTC dan → `ephemerisRefetchKey++`), `setMoonRiseSet` (reclamp reference uz anchor), `syncTimeToNow`, `setMapView`, `setFlightProvider` (čisti retention, reset selection), `setFlights`, `resetError`, `loadFlightsInBounds` (observer iz `useObserverStore`).

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
| `offsetHours`, `onSlider` | Klizač (sati kao float) |
| `syncTime` | Wrap na `syncTimeToNow` |
| `showEphemeris` | `false` do prvog layout mount + sync (sprječava flash „—”) |
| `moonDisplay`, `candidatesDisplay`, `showEmptyCandidates` | Maskirani prikazi dok ephemeris nije spreman |
| `activeTransits` | `useActiveTransits(0.5)` — prag ° za „blizu” |
| `isGolden` | `activeTransits.some(deltaAz < 0.1)` |
| `goldenFlashToken`, `setGoldenFlashToken` | Za `GoldenAlignmentFlash` |
| `nearestWindow` | `useNearestTransitWindow` |
| `obs`, `observerLocationLocked`, `requestFocusOnObserver` | Observer store |
| `onUseGps`, `gpsBusy`, `gpsError` | GPS |
| `timeSliderStartLabel`, `timeSliderEndLabel`, `sliderWidthHours`, `timeSliderMode` | Za `TimeSliderPanel` |

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

## 9. Desktop shell: tri stupca (`HomePageClient.tsx`)

### 9.1 Breakpoint

- **`useIsMdUp()`** — `matchMedia("(min-width: 768px)")`, početno `false` (SSR/hidratacija sigurna).  
- Ispod 768px: **nije** tri stupca; karta pun visina + bottom sheet + 4 taba.

### 9.2 Desktop grid

```text
className:
  grid min-h-0 min-w-0 flex-1
  auto-rows-[auto_minmax(0,1fr)]
  grid-cols-1 md:grid-cols-[20rem_minmax(0,1fr)_20rem]
```

- **Red 1:** `auto` — header + chrome.  
- **Red 2:** `minmax(0,1fr)` — glavna visina; stupci **20rem | fluid | 20rem**.

### 9.3 Ćelije (md+)

| Regija | Grid pozicija | Ključni razredi / sadržaj |
|--------|---------------|---------------------------|
| Brand | `md:col-start-1 md:row-start-1` | `mt-chrome-bar`, `AppHeaderBrand` (logo + `.mt-title` „LunaPic”) |
| Time + weather | `md:col-span-2 md:col-start-2 md:row-start-1` | `TimeAndWeatherBlock` → `WeatherOverlay`, toolbar (`mt-toolbar-btn`), `TimeSliderPanel variant="mapChip"` |
| Mission aside | `md:col-start-1 md:row-start-2` | `aside.mt-side-rail`, `border-r`, `p-4`, `overflow-y-auto`, `[scrollbar-gutter:stable]` |
| Map | `md:col-start-2 md:row-start-2` | `rounded-2xl`, jaka sjena + tanki bijeli ring; **`MapContainer`** |
| Field aside | `md:col-start-3 md:row-start-2` | `aside.mt-side-rail`, `border-l`, isti scroll ponašanje |

Korijen aplikacije u shellu: `mt-app-root`, `h-dvh`, `overflow-hidden`, `flex-col`.

### 9.4 Sadržaj stupaca (redoslijed komponenti)

**Lijevo (Mission):**  
`FlightSourcePanel` → `ObserverLocationPanel` → `MoonEphemerisPanel` → `TransitCandidatesPanel` → `ActiveTransitsPanel`.

**Desno (Field):**  
`PhotographerToolsPanel` → `CompassAimPanel` → `FieldOverlaysSection`.

### 9.5 Mobilni način (sažeto)

- Karta: `flex-1`, bottom padding za navigaciju; **floating** brand chip (`z-40`, staklo).
- **Sheet:** `z-50`, `max-h-[78dvh]`, snap visine (`peek` / `half` / `full`), drag handle, `translateY` za drag.
- **Tab bar:** `z-[60]`, horizontal scroll, ~5 tab widths visible; one tab per shell card (Flight … Field) — inner `role="tablist"` (see `HomePageClient` + `MOBILE_BOTTOM_TABS`).
- Mobilni sadržaj decka: `data-testid="mobile-deck-content"` (CSS za `select` u `globals.css` ga cilja).

---

## 10. `TimeSliderPanel`

- **Varijante:** `mapChip` (kompaktno, `SectionCardSurface` accent **amber**) | `panel` (veća kartica).
- **Korak klizača:** `1/60` h (1 minuta).
- **Hydracija:** `useHasMounted` — labela „—” dok nije klijent (izbjegava mismatch datuma).
- **Horizon dim:** ako je mjesec ispod horizonta i ephemeris spreman: `opacity-60 saturate-[0.65]` na korijenu panela.
- **Prikaz vremena:** `referenceEpochMs` kao `toLocaleString("en-GB", …)` s `suppressHydrationWarning` gdje treba.

### 10.1 Planning date picker (time ribbon)

- **Uzorak:** okrugli ikonski gumb (kalendar outline SVG, isti stroke stil kao Sync ikona) otvara **custom kalendar popup** po combobox uzorku (§4): `createPortal(..., document.body)`, `position: fixed`, **`z-[280]`**, staklo (`border-white/10 bg-zinc-900/95 backdrop-blur-md rounded-2xl`). Native `<input type="date">` je zabranjen — popup mu se ne može ni pozicionirati ni stilizirati (bježi ispod ruba na full-screenu). Referenca: `PlanningDateButton` + `PlanningCalendarPopup` u `HomePageClient.tsx`.
- **Pozicioniranje popupa (desktop, `md+`):** **iznad sidra** (`bottom = innerHeight − rect.top + 8`), desni rub poravnat s gumbom, clamp na rubove viewporta (`8px`). Širina 272 px.
- **Mobile (`<md`):** **full-screen modal** — backdrop `fixed inset-0 z-[280] bg-black/70 backdrop-blur-sm`, kartica centrirana (`w-[min(22rem,100%)]`), dnevne ćelije povećane na `h-11 w-11` (touch target), dodatni ✕ gumb u headeru. Backdrop tap i Escape zatvaraju. Razlog: anchored popup se na malom ekranu miješa s altitude legendom i dockom.
- **Kalendar semantika:** tjedan počinje ponedjeljkom (`Mo…Su`); prošli dani disabled (`text-zinc-600`); **danas** = emerald ring; **odabrani (planning) dan** = amber (`bg-amber-500/25 ring-amber-400/60`); hover slobodnih dana amber. Mjesečna navigacija ne ide u mjesece prije tekućeg. Zatvaranje: klik izvan + Escape.
- **Pozicija:** u time ribbonu između slidera i Sync gumba (mobile `h-8 w-8`, desktop `h-9 w-9`).
- **Stanja:** neaktivno = neutralno (`border-white/15`, `text-zinc-300`, hover amber); **planning mode aktivan** = amber (`border-amber-500/50 bg-amber-500/[0.16] text-amber-300`) — amber jer je vremenska manipulacija (isti akcent kao slider).
- **Ograničenja:** `min` = današnji lokalni datum; odabir današnjeg (ili ranijeg) datuma = povratak u live (`syncTimeToNow`). Budući datum → `setTimeAnchorPlanned(lokalna ponoć)`.
- **Planning mode semantika:** store flag `timeAnchorIsPlanned`; `tickLiveTime` tada NE povlači sidro na now. Live-ovisni izračuni (kandidati, active transits, photographer) vraćaju prazno / reason `planningMode`; paneli prikazuju amber napomenu (`border-amber-500/30 bg-amber-500/10 text-amber-300/90`). Ephemeris slojevi (Mjesec, putanja, koridor) rade normalno za odabrani dan.

### 10.2 Best hours (planning mode, Transit candidates panel)

- **Izvor:** `computeBestTransitHours` (`src/lib/domain/astro/bestTransitHours.ts`) — 24 satna uzorka (sredina sata): elevacija Mjeseca → `slant = (11 km − visina promatrača)/sin(elev)` → % promjera Mjeseca za default 40 m avion. Čisti ephemeris, bez live podataka.
- **Tierovi (konstante u istoj datoteci):** `great` ≥ 15 % diska (emerald `bg-emerald-500/25 text-emerald-300`), `ok` 8–15 % (amber `bg-amber-500/20 text-amber-300`), `poor` < 8 % (`bg-white/[0.05]`, tercijarni tekst), `belowHorizon` < 5° elevacije (prozirno, `text-zinc-700`).
- **Prikaz:** grid `grid-cols-8` (24 ćelije `h-8 rounded-lg`, font-mono sat `HH`), legenda s tri točke, sažetak "Best around HH:00 …". Aktivni (simulirani) sat: `ring-1 ring-sky-400/70` (sky = selekcija, §4a).
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
- **„Gdje stati” slojevi:** **emerald** = cijela obitelj „stani ovdje” — točka, elipsa tolerancije **i putanja sjene** s minutnim oznakama (`rgba(52,211,153,0.75)`, `dasharray [5,3]`, oznake `#a7f3d0`); **sky** = nesigurnost (krug povijesnog rasipanja rute, `fill 0.10` / rub `0.35`). Tri mjerila namjerno se crtaju zajedno: elipsa je desetci metara, rasipanje stotine metara do kilometara — kontrast između njih **jest** poruka.
- **Amber je rezerviran za vlastito gibanje aviona** (`selected-flight-trajectory`, `#fde68a`, sitne crtice `[0.9,1.25]`, oznaka `+90s`) i za sat na luku Mjeseca. Putanja sjene je do 2026-08-23 bila amber isprekidana — ista boja **i** ista obitelj uzorka kao predikcija leta, pa se dvije linije o dva različita objekta nisu dale razlikovati na prvi pogled. Duge crtice su drugi znak, da razlika ne visi samo o boji.
- **Planning panel (`PlanningPanel`, id `planning`)** — planer za LDZA koji za odabrani dan/prozor/korak crta linije „stani ovdje” za virtualni A320 na prilazu 04 (3°, TCH 15 m) i odlasku 22 (gradijent 8 %). Cijela obitelj je **emerald** (`#34d399`, širina 4); tokovi se razlikuju **crticom, ne bojom**: prilaz = puna linija, odlazak = `line-dasharray [2,1.5]`. Svaka linija nosi bijelu oznaku sata (`HH:MM`, `en-GB`) na bližem kraju; marker (krug 4.5) na 4/6/8/10/12 km nosi pokrivenost u promjerima Mjeseca (`4.1×`, `#a7f3d0`) i oznaka se crta samo za fokusirani trenutak (ili za sve dok ništa nije fokusirano). Fokus = klik na redak u panelu, ostale linije padaju na `opacity 0.22` umjesto da nestanu. Odabir dana/vremena/koraka/veličine ide kroz `ShellSelect` (generički combobox, §4) — **native `<input type="date">` zabranjen** (§10.1). „Aircraft size” je **samo donja granica** (Any, ≥1×, ≥1.5×, ≥2×, ≥3× Mjeseca), bez gornje. Amber ostaje rezerviran za gibanje aviona/sat na luku Mjeseca, pa se ovdje koristi samo za upozorenja (Mjesec < 5°, skraćen popis). Izvor računa: `runwayShadowPlan.ts` (domena) — profili su pretpostavke i nose se u footnoteu panela. **Zadani prikaz = jedno vrijeme:** panel automatski fokusira prvi redak i na karti crta samo njega (deset skoro paralelnih linija na 10 min razmaka čitaju se kao jedna široka traka); kvačica „Show all times on the map” (`runwayPlanShowAll`) vraća sva vremena s prigušenjem neodabranih. Klik na redak u zadanom prikazu uvijek odabire; u show-all prikazu klik na odabrani redak skida fokus. **Uputa** („How to use”, sky okvir kao napomene u `FlightLogPanel`) je sklopiva i pamti se u `localStorage` (`lunapic.planning.guideHidden`, uz try/catch). **„Days with the Moon up”:** idućih 30 dana, po danu osvijetljenost Mjeseca (tierovi kao §10.2: ≥85 % emerald, 50–85 % amber, ispod tercijarno) i prozori u kojima je Mjesec ≥ 12° (`runwayPlanDays.ts`, `CAUTION_BELOW_DEG`); klik na prozor puni dan/od/do (prvih 90 min). Prvih 7 dana s prozorom, ostalo iza „Show all 30 days”. Panel se otvara na prvom prozoru od sada, ne na praznom danu. Pregled ne ocjenjuje stazu, vjetar ni promet.
- **Transit forecast panel (`TransitForecastPanel`, id `forecast`, grupa Plan)** — „Upcoming opportunities” (`/api/flight-log/transit-calendar`, idućih 14 dana) i „Where to stand” (`/api/flight-log/photo-spots`). Do 2026-10-29 bili su na dnu Flight loga; podaci dolaze iz loga, ali pitanje je planersko („kamo i kada ići”), pa su u Planu. Flight log zadržava samo povijest (tablica, tipovi, „Past transits”). Panel je standardne širine (408 px), ne `wide`.
- **Bedž pokrivenosti** (`PhotoSpotRow`, `TransitForecastPanel.tsx`): ≥ 50 % emerald, 25–50 % amber, < 25 % neutralno (`bg-white/[0.05]`, tercijarni tekst; dohvatljivo samo preko `closest` liste promašaja, koja ignorira prag). Klizač je **samo donja granica**, 25–150 %, default 25 — gore se ne filtrira ništa: avion širi od diska (prilazni promet redovito prelazi 150 %) je željeni rezultat, pa vrh klizača služi da se traže *samo* takvi.

---

## 12. Z-index referenca (redoslijed složenosti)

| Zona | z-index | Napomena |
|------|---------|----------|
| Combobox portal | 280 | Mora biti iznad bočnih kartica |
| Golden flash | 200 | Puni ekran |
| Header mobile | 78 | |
| Altitude legend + layers | 76 | `fixed`, iznad ribbona |
| MobileSheet | 75 | `absolute` |
| Mobilni tab bar (MobileDock) | 60 | `absolute bottom-0` |
| TimeRibbon (mobile compact) | 14 | `absolute`, iza sheeta |
| Map aircraft popup (CSS klasa) | 20 | |

---

## 12a. Mobilni bottom layout — CSS varijable

**Nikad ne dodavaj `env(safe-area-inset-bottom)` direktno na `bottom` u komponentama iznad doka.** SAI je već uračunat u `--mobile-dock-h`; dodavanje ga zasebno u svakom elementu duplira pomak na pravim uređajima s home indicatorom (iPhone ≈ +34px).

Jedino mjesto gdje se SAI računa je `globals.css`:

```css
--mobile-dock-h:        calc(4rem + max(0.75rem, env(safe-area-inset-bottom, 0px)));
--mobile-ribbon-bottom: calc(var(--mobile-dock-h) + 0.25rem);
--mobile-overlay-bottom: calc(var(--mobile-ribbon-bottom) + 3.25rem);
```

Raspon vrijednosti (browser SAI=0 / iPhone SAI≈34px):

| Varijabla | Browser | iPhone |
|-----------|---------|--------|
| `--mobile-dock-h` | 4.75 rem | 6.125 rem |
| `--mobile-ribbon-bottom` | 5.00 rem | 6.375 rem |
| `--mobile-overlay-bottom` | 8.25 rem | 9.625 rem |

Koristi u Tailwindu kao `bottom-[var(--mobile-overlay-bottom)]` ili u `calc()`:
- TimeRibbon (compact): `bottom-[var(--mobile-ribbon-bottom)]`
- Altitude legend wrapper / IncomingTransitAlert (mobile): `bottom-[var(--mobile-overlay-bottom)]`
- MobileSheet: `bottom-[calc(var(--mobile-dock-h)-0.25rem)]`

**Ako dodaješ novi floating element iznad doka na mobilnom** → koristi jednu od gore navedenih varijabli ili izgradi na njima — ne uvodi novu `calc(...+env(safe-area-inset-bottom))` konstantu.

---

## 12b. Mobilni popup aviona — pozicioniranje

`SelectedAircraftMapPopup` koristi Mapbox `Popup` s `anchor: "bottom"`. Sidrišna točka (u piksel-koordinatama map containera) računa se dinamički iz DOM-a, **ne** iz hardkodirane konstante.

### Princip

```
sidrišna y = rect.height - mobileBottomUiHeightPx()
```

`mobileBottomUiHeightPx()` (u `src/lib/map/selectedAircraftPopupAnchor.ts`) mjeri stvarnu visinu doka iz DOM-a:

```ts
const nav = document.querySelector('[data-testid="mobile-primary-nav"]');
const dockHeightPx = window.innerHeight - nav.getBoundingClientRect().top;
return Math.round(dockHeightPx) + 56;  // +4px gap +44px ribbon +8px margin
```

Raspon (browser SAI=0 / iPhone SAI≈34px):

| | Browser | iPhone |
|---|---|---|
| Izmjerena visina doka | ≈76 px | ≈98 px |
| `mobileBottomUiHeightPx()` | 132 px | 154 px |

Popup tip (`anchor: "bottom"`) sjeda točno na tu visinu od dna; kartica raste prema gore i ne ulazi u zonu ribbona / doka.

### Što NE raditi

- **Ne koristiti hardkodiranu konstantu** (`MOBILE_POPUP_ANCHOR_ABOVE_MAP_BOTTOM_PX = 140`) — ta je vrijednost bila pogrešna za prave uređaje s home indicatorom.
- **Ne dodavati `setOffset` nudge** — sidrište je sada točno, offset treba biti `[0, 0]`.
- **Ne čitati `padding-bottom` s roditeljskih elemenata** — map container nema relevantni padding, posredno mjerenje nije pouzdano.

### Veza s CSS varijablama (sekcija 12a)

`56px` u `mobileBottomUiHeightPx()` odgovara istim konstantama:
- `4px` = gap iznad doka (`0.25rem` iz `--mobile-ribbon-bottom`)
- `44px` = visina ribbona (`h-11`)
- `8px` = sigurnosni razmak

Ako se visina ribbona ili gap mijenjaju u CSS-u, isti broj treba ažurirati i u `selectedAircraftPopupAnchor.ts`.

---

### Animacija aviona na karti

- Prikazane pozicije i GeoJSON imaju zajednički minimalni interval **40 ms** (najviše 25 osvježavanja/s; stvarni tempo ovisi o frameovima i uređaju).
- Izračuni statusa tranzita koriste sirove fixove na field ticku; animirane pozicije služe prikazu.
- Odabrani avion, njegova kartica i predikcija putanje koriste izravnu ekstrapolaciju istog fixa kao Photographer brojač, bez dodatnog filtra sustizanja. Animacija između fixova ostaje; novi fix odmah korigira poziciju. Glađenje ostalih markera ne smije se koristiti kao ulaz za brojač.
- ATC oznake, spojnice i predikcije obnavljaju se samo u ATC modu.
- Animacijski rAF miruje dok je dokument skriven; tempo dohvaćanja ADS-B podataka ostaje neovisan.

---

## 13. Pristupačnost i E2E

- Toolbar u `TimeAndWeatherBlock`: `role="toolbar"`, `aria-label="Map and time actions"`.
- Sekcije: `ShellSectionCard` vezuje naslov na `aria-labelledby`.
- Novi kontroli u shellu: dodati **`data-testid`** gdje je logično za Playwright (`e2e/`).
- `prefers-reduced-motion`: poštovati za animacije (golden flash, toolbar scale, map shimmer).

---

## 14. Checklist za agenta pri redizajnu

1. [ ] Zadržati **tri logičke zone**: Mission | Map | Field (čak i ako se širine ili breakpoint mijenjaju).
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
| Kartica sekcije | `src/components/shell/ShellSectionCard.tsx` |
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
