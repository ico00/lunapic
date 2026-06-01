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
   → isključen (azimut se nikad neće poravnati s Mjesecom)

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

## Aktivan transit (`useActiveTransits`)

Let je u "active transit" kad mu je **puna 2D kutna separacija** od Mjeseca ≤ 0.5° (kombinacija azimuta + elevacije, ne samo azimut). Koristi `angularSeparationDeg` iz `sky-separation.ts`.

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

---

# Prije pisanja nove komponente ili UI elementa

1. **Pronađi konkretan primjer** sličnog elementa u istom direktoriju (`grep`, `Read`). Ne oslanjaj se na opis iz Explore agenta — pročitaj stvarni kod.
2. **Provjeri kako shell okružuje sadržaj** — u ovom projektu rail/sheet panel već daje naslov i vizualni okvir. Komponente koje se renderiraju unutar `renderPanel()` vraćaju **goli sadržaj bez omotača** (`ShellSectionCard` ili sličnog). Dodavanje vlastitog omotača rezultira duplikacijom naslova i okvira.
3. **Primjer ispravnog uzorka** (iz `HomePageClient.tsx`): `CompassAimPanel` i `FieldOverlaysSection` vraćaju plain `<div>` — shell renderira naslov iz `MOBILE_PANEL_TITLES` / `RAIL_ITEMS` automatski.