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

**MapContainer** također: `data-testid="map-surface"`; bez tokena `data-testid="map-missing-token"`. Popup klasa: `.moon-transit-aircraft-popup` (desktop `z-index: 20`; mobile `max-width: 767px` → **80**, iznad bottom tabova).

### 11.1 Boje i filtri na karti (konceptualno)

- **`shotFeasibleFlightIds`:** podskup letova koji prolaze screening + max domet kamere — koristi se za vizualno istaknuti „izvedive” markere.
- **`isGolden`:** prosljeđuje se u `useMoonTransitMap` za nisan / okvir markera.
- **„Gdje stati” slojevi:** **emerald** = cilj (točka i elipsa tolerancije — mjesto na koje treba stati), **amber** = sve vremensko (putanja sjene, minutne oznake `+1m`, `+2m`…), **sky** = nesigurnost (krug povijesnog rasipanja rute, `fill 0.10` / rub `0.35`). Tri mjerila namjerno se crtaju zajedno: elipsa je desetci metara, rasipanje stotine metara do kilometara — kontrast između njih **jest** poruka.
- **Bedž pokrivenosti** (`PhotoSpotRow`): ≥ 25 % emerald, 10–25 % amber, < 10 % neutralno (`bg-white/[0.05]`, tercijarni tekst). Prag na klizaču je 5–50 %; 50 % je dostižno samo ispod ~9 km visine aviona.

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
