# Optimization and refactoring log — Moon Transit

This document records the architectural refactors, file splits, and design decisions made to improve **separation of concerns** (UI vs orchestration vs domain), **SRP**, and **maintainability**, without changing product behavior unless noted.

For day-to-day architecture rules, see `documentation/architecture.md`. For the short checklist, see `documentation/refactor-roadmap.md`.

---

## 1. Principles applied

| Principle | How it shows up in the repo |
|-----------|-----------------------------|
| **Domain purity** | `lib/domain` has no React/Zustand; ephemeris and geometry stay testable in isolation. |
| **Orchestration in hooks** | Stores and services are wired in `src/hooks/*` (e.g. `useWeatherSync`, `useHomeShellOrchestration`, `useMoonTransitMap`), not in presentational components. |
| **Thin UI** | Panels under `components/shell/panels` and `MapObserverControlStrip` receive props; no business rules inside JSX trees. |
| **Single source of map IDs** | `lib/map/mapSourceIds.ts` for GeoJSON source names used by Mapbox. |

---

## 2. Weather feature (refactor path)

- **`lib/domain/weather/weatherService.ts`** — `getCloudCover(lat, lng, timestampMs, signal?)` using Open-Meteo forecast API (hourly `cloud_cover`).
- **`stores/weather-store.ts`** — cloud %, loading, error.
- **`hooks/useWeatherSync.ts`** — connects observer + `referenceEpochMs` to the service and store.
- **`components/weather/WeatherOverlay.tsx`** — display only from the weather store.

---

## 3. Map module (`lib/map`)

| File | Role |
|------|------|
| `mapSourceIds.ts` | Canonical names: `flights-geo`, `routes-geo`, moon sources, etc. |
| `mapOverlayConstants.ts` | Ray lengths (azimuth / moon path), cruise altitude, optimal-ground half-width. |
| `geoBoundsFromMapbox.ts` | `LngLatBounds` → app `GeoBounds`. |
| `observerMarkerElement.ts` | DOM for the Mapbox `Marker` (camera icon). |
| `registerMoonTransitLayers.ts` | All `addSource` / `addLayer` for the Moon Transit map after style `load`. |

---

## 4. Map React layer

| File | Role |
|------|------|
| `hooks/useExtrapolatedFlightsForMap.ts` | Wall clock tick + `extrapolateFlightForDisplay` + OpenSky skew; output for the map. |
| `hooks/useMapMoonOverlayFeatures.ts` | Builds moon path, azimuth line, route intersections, optimal ground as GeoJSON-ready objects from `AstroService` + `GeometryEngine`. |
| `hooks/useMapGeoJsonSync.ts` | Pushes GeoJSON to Mapbox sources when data or `mapReadyTick` changes (four effects to preserve fine-grained dependencies). |
| `hooks/useMoonTransitMap.ts` | Mapbox `Map` instance, `moveend` / bounds refresh / flight load, observer marker DOM (golden crosshair, lock ring, `setLngLat`, `flyTo` on focus nonce). |
| `components/map/MapObserverControlStrip.tsx` | Bottom-left “Set my location here” / “Focus on me” controls. |
| `components/map/MapContainer.tsx` | Composes hooks, `WeatherOverlay`, `MapObserverControlStrip`; shows missing-token message if env is unset. |

**Optimization note:** GeoJSON `setData` is split by concern (moon vs path vs flights vs routes) to avoid re-pushing the entire world when only one input changes.

---

## 5. Shell / home page

| File | Role |
|------|------|
| `hooks/useHomeShellOrchestration.ts` | All Zustand subscriptions, `usePhotographerTools`, `useGpsObserver`, time slider state, golden flash token, derived lists. |
| `components/shell/HomePageClient.tsx` | Layout: aside + map column; passes props from the orchestration hook into panels. |
| `components/shell/GoldenAlignmentFlash.tsx` | Full-screen flash on first “golden” alignment. |
| `components/shell/panels/*` | `FlightSourcePanel`, `ObserverLocationPanel`, `MoonEphemerisPanel`, `TimeSliderPanel`, `TransitCandidatesPanel`, `ActiveTransitsPanel`, `PhotographerToolsPanel`, `SidebarSyncFooter`. |

**Export:** `PhotographerToolPack` is exported from `hooks/usePhotographerTools.ts` for typing the photographer panel without importing `GeometryEngine` in UI.

---

## 6. Formatting and GPS

- **`lib/format/numbers.ts`** — `formatFixed`, `mpsToKnots` (replaces ad-hoc helpers in the shell).
- **`hooks/useGpsObserver.ts`** — `navigator.geolocation` → `useObserverStore` (errors and busy state).

---

## 7. State: `useMoonTransitStore` (design decision)

`moon-transit-store` currently holds **time simulation**, **map view** (`mapView`), **flight provider + flights + loading/error**, **selected flight**, and **OpenSky display skew** in a **single** Zustand store.

**Decision:** Treated as an **intentional aggregate** for the current app size: one place to `loadFlightsInBounds` after the map moves, and `referenceEpochMs` is co-located with the data that the slider and ephemeris already depend on.

**Authoritative short doc:** `src/stores/README.md` (Croatian), linked from this file and from `documentation/technicalconventions.md`.

**Future optional split (not required now):** separate stores e.g. `useTimeStore`, `useFlightsStore`, `useMapViewStore` would require clear ownership of `loadFlightsInBounds` and cross-store subscriptions or a small “session” orchestrator. Document any future split in this file and in `architecture.md`.

---

## 8. Domain: `GeometryEngine` (module split, 2026)

`GeometryEngine` is a **facade** class; call sites keep `GeometryEngine.*` unchanged.

| Module | Role |
|--------|------|
| `geometryEngineTypes.ts` | `LatLng`, `RouteIntersection` |
| `geometryEngineMoonRay.ts` | ENU/parallax helpers, `buildMoonAzimuthLine`, `buildMoonPathLineCoordinates`, `intersectMoonAzimuthWithStaticRoutes`, `buildOptimalGroundPathFeatures` |
| `geometryEnginePhotographer.ts` | `aircraftLineOfSightKinematics`, `photographerPack` |
| `geometryEngine.ts` | Re-exports static methods; `RouteIntersection` / `LatLng` types |

`lib/domain/index.ts` exports `RouteIntersection` from `geometryEngineTypes.ts`.

---

## 8.1 Field performance (2026)

- **`src/lib/perf/fieldPerf.ts`** — zero overhead when off; `fieldPerfTime` / `fieldPerfRecord` in hot hooks.
- **UI** — `FieldPerfOverlay` (top-right), React `Profiler` on the map column when enabled.
- **Doc** — `documentation/performance.md` (how to turn on, Chrome DevTools, label table).

## 8.2 Line-count impact (approximate)

| Area | Before (order of magnitude) | After |
|------|-----------------------------|--------|
| `MapContainer` | 600+ lines | &lt; 100 (composition + token gate) |
| `HomePageClient` | 500+ then ~180 | ~100 (JSX + hook) |
| Map logic | Inline in `MapContainer` | Split across `useMoonTransitMap`, `registerMoonTransitLayers`, `useMapGeoJsonSync` |

---

## 9. Changelog

User-visible and structural changes are also summarized under **[Unreleased] → Changed** in `documentation/changelog.md` when a release is cut.

---

## 10. Related files (quick index)

- Hooks: `src/hooks/`
- Map helpers: `src/lib/map/`
- Domain: `src/lib/domain/` (geometry: `geometryEngine*.ts`)
- Related: `documentation/performance.md` (field/runtime profiling for map + hooks)
- Shell panels: `src/components/shell/panels/`
- Stores: `src/stores/` (see `src/stores/README.md` for the aggregate design)
- Perf overlay: `src/lib/perf/fieldPerf.ts`, `src/components/perf/FieldPerfOverlay.tsx`
