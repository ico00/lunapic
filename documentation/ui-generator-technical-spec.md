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
| `.mt-section-label` | Outfit, `0.65rem`, **uppercase**, `tracking-[0.2em]`, `text-zinc-400/95` |
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

### 2.7 Paleta u praksi (Tailwind)

 dominantno **zinc** (pozadina, tekst), **emerald** (uspjeh, sync, prsten fokusa), **amber** (lokacija / upozorenja / time accent), **sky** (sekundarni naglasci, „focus on me”). **Rose / violet / lime** dostupni kao **accent linija** na `ShellSectionCard` (ne nužno u cijeloj UI).

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
- **Reference:** `FlightProviderSelect.tsx`, `CameraSensorSelect.tsx`.

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
| `cameraSensorType` | `CameraSensorType` | `fullFrame \| apsC \| microFourThirds`. |
| `moonRise` / `moonSet` | `Date \| null` | suncalc za kalendar dan konteksta. |
| `moonRiseSetKind` | `"normal" \| "alwaysUp" \| "alwaysDown"` | |
| `ephemerisRefetchKey` | `number` | Sync + prijelaz **UTC dana** na klizaču. |

### 6.3 Akcije (sažeto)

`setSelectedFlightId`, `setOpenSkyLatencySkewMs`, `addOpenSkyLatencySkewMs`, `setCameraFocalLengthMm`, `setCameraSensorType`, `setTimeOffsetMs` (UTC dan → `ephemerisRefetchKey++`), `setMoonRiseSet` (reclamp reference uz anchor), `syncTimeToNow`, `setMapView`, `setFlightProvider` (čisti retention, reset selection), `setFlights`, `resetError`, `loadFlightsInBounds` (observer iz `useObserverStore`).

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

### 8.4 Shot feasibility

- Tieri `excellent | fair | poor`; vezano uz žarište, crop senzora, slant range.

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

**MapContainer** također: `data-testid="map-surface"`; bez tokena `data-testid="map-missing-token"`. Popup klasa: `.moon-transit-aircraft-popup` (desktop `z-index: 20`; mobile `max-width: 767px` → **80**, iznad bottom tabova).

### 11.1 Boje i filtri na karti (konceptualno)

- **`shotFeasibleFlightIds`:** podskup letova koji prolaze screening + max domet kamere — koristi se za vizualno istaknuti „izvedive” markere.
- **`isGolden`:** prosljeđuje se u `useMoonTransitMap` za nisan / okvir markera.

---

## 12. Z-index referenca (redoslijed složenosti)

| Zona | cca. z-index | Napomena |
|------|----------------|----------|
| Combobox portal | 280 | Mora biti iznad bočnih kartica |
| Golden flash | 200 | Puni ekran |
| Mobilni tab bar | 60 | |
| Mobilni sheet | 50 | |
| Floating brand (mobile) | 40 | |
| Map aircraft popup (CSS klasa) | 20 | |

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
| Konvencije | `documentation/technicalconventions.md`, `documentation/architecture.md` |
