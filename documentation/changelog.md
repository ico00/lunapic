# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
where version bumps are made for releases (currently `0.x`).

## [Unreleased]

### Added

- **Weather (map)** — Hourly `cloud_cover` from the [Open-Meteo](https://open-meteo.com/) forecast API for the fixed observer, sampled at the simulated `referenceEpochMs` (same anchor as the moon / time controls). `getCloudCover` in `src/lib/domain/weather/weatherService.ts`; `useWeatherStore` holds cloud % and load state. Small “☁️ N% Clouds” chip top-left in `MapContainer`.
- **Moon path (map)** — 12 h ground track of the moon’s direction from the ephemeris anchor: `AstroService.getMoonPathSamples` (24 points / 30 min) → `GeometryEngine.buildMoonPathLineCoordinates`; GeoJSON sources `moon-path-geo` (dashed `LineString`) and `moon-path-labels-geo` (2-hourly hour labels on a `symbol` layer). Uses a **shorter ray length** than the long moon–route intersection azimuth so the path stays in regional map scale. Updates when the observer or `referenceEpochMs` (time anchor + offset) changes. Label color matches the camera marker border (amber).
- **Docs** — `documentation/optimization-and-refactoring.md` — consolidated log of refactors (hooks, `lib/map`, shell panels, `useMoonTransitMap`, `useHomeShellOrchestration`, store design note for `moon-transit-store`).
- **Docs** — `src/stores/README.md` — short Croatian rationale for the single `moon-transit-store` aggregate; cross-links to `architecture.md` and optimization doc.
- **Docs** — `documentation/technicalconventions.md` — “Adding a new feature (checklist)” and State section links to the stores README; geometry split noted under Data and geometry.
- **CI / E2E** — GitHub Actions workflow (`.github/workflows/ci.yml`: ESLint, typecheck, Vitest, build, Playwright). Playwright: `e2e/smoke.spec.ts`, `e2e/flight-source.spec.ts` (provider). `data-testid` for map column (`map-loading`, `map-surface`, `map-missing-token`) and `flight-provider-select` for the provider `<select>`.
- **Domain** — `GeometryEngine` split into `geometryEngineMoonRay.ts`, `geometryEnginePhotographer.ts`, `geometryEngineTypes.ts`; `geometryEngine.ts` remains a thin facade; `RouteIntersection` exported from types in `lib/domain/index.ts`.

- **Field performance (map)** — `src/lib/perf/fieldPerf.ts`, `FieldPerfOverlay`, React `Profiler` on the map block when `NEXT_PUBLIC_FIELD_PERF=1` or `localStorage.moonTransitFieldPerf`. Instrumented: `useMapMoonOverlayFeatures`, `useMapGeoJsonSync`, `useExtrapolatedFlightsForMap`, `useMoonTransitMap` (`map:moveendToIdle`, `map:boundsRefresh`). See `documentation/performance.md`.
- **Security (dependencies)** — `npm audit` addresses: `@playwright/test` ^1.59.1; `package.json` `overrides.postcss` ^8.5.10. CI runs `npm audit` after `npm ci`.

### Changed

- **Docs** — `documentation/README.md` full index (architecture, performance, conventions, optimization, roadmap, changelog, stores README). `architecture.md`: new **Quality assurance** (Vitest, Playwright, CI including `npm audit`, field perf links). `technicalconventions.md`: CI steps list `npm audit` after `npm ci`. Expanded domain + `fieldPerf` tests remain summarized in `technicalconventions` (Testing).
- **Hooks / ESLint** — `useDeviceCompass` (initial `listening` without `setState` in `useEffect`), `useMoonTransitMap` (`providerRef` in `useLayoutEffect`), `useHomeShellOrchestration` (direct `routeCorridor`, `queueMicrotask` for `ephemerisReady`), `useMapGeoJsonSync` (effect deps include `mapRef` / `mapReadyTick`). CI runs `npm run lint`.

- **Map / shell** — `useMoonTransitMap` owns Mapbox init, marker, bounds refresh; `MapObserverControlStrip` for in-map buttons; `useHomeShellOrchestration` centralizes `HomePageClient` data flow. `documentation/architecture.md` updated (map source ids, store aggregate note with links to `src/stores/README.md` and `technicalconventions`, extension points). `refactor-roadmap.md` Faza C closed (store docs + `GeometryEngine` module split + feature checklist). `documentation/README.md` and `optimization-and-refactoring.md` §7–8 updated accordingly.

- **Refactor (shell)** — `HomePageClient` sastoji se od orkestracije + panela: `FlightSourcePanel`, `ObserverLocationPanel`, `MoonEphemerisPanel`, `TimeSliderPanel`, `TransitCandidatesPanel`, `ActiveTransitsPanel`, `PhotographerToolsPanel`, `SidebarSyncFooter`, `GoldenAlignmentFlash`. Izvoz `PhotographerToolPack` iz `usePhotographerTools` za tipove UI-a.
- **Refactor (architecture)** — Map overlay GeoJSON assembly moved to `useMapMoonOverlayFeatures`; extrapolated flight positions for the map to `useExtrapolatedFlightsForMap`. Shared Mapbox source ids in `src/lib/map/mapSourceIds.ts`, overlay constants in `src/lib/map/mapOverlayConstants.ts`. `useGpsObserver` for geolocation; `formatFixed` / `mpsToKnots` in `src/lib/format/numbers.ts`. **Mapbox layer registration** extracted to `registerMoonTransitLayers` (`src/lib/map/registerMoonTransitLayers.ts`), bounds helper `geoBoundsFromMapbox`, observer marker DOM in `observerMarkerElement.ts`. **`useMapGeoJsonSync`** centralizes `setData` updates for all map GeoJSON sources. See `documentation/refactor-roadmap.md` for the ongoing plan.
- Documentation files live under `documentation/` (see `documentation/README.md`). Root `README.md` and `.cursorrules` point there.

## [0.1.0] — 2026-04-25 (documentation snapshot)

**Summary:** First documented snapshot of the Moon Transit app (private Next.js 16 + Mapbox + Zustand).

### Added (feature overview — pre-changelog; approximate)

- **Map** — Mapbox dark basemap, moon azimuth ray, static route polylines, route–moon intersections (yellow markers), OpenSky (or static/mock) flight positions with aircraft symbol + track rotation.
- **Time** — “Simulated now” with ±6 h slider; sync back to system time.
- **Observer** — Fixed ground point, GPS, set from map center, lock, focus map on observer.
- **Flights** — Provider switch: mock / static (`routes.json`) / OpenSky (proxied via `GET /api/opensky/states`).
- **Transit UI** — Candidate list, “active” alignments within tolerance, golden flash at tight alignment; nearest transit window hint from slider search.
- **Photographer** — Countdown to alignment, ω, slant range, transit duration, suggested shutter, optional beep; compass panel; field skew + text/PNG export.

### Fixed / adjusted (not exhaustive)

- Static flight **track** derived from route segment (no longer a constant 90°), so map icons follow corridors.
- Flight **icon** — Rasterized from canvas; symbol layer and layer ordering vs intersection markers; Mapbox `icon-rotate` expression kept compatible with per-feature `trackDeg`.
- **UI** — User-facing copy in English; layout fixes for field/compass sections on small viewports.

### Technical

- **Stack** — Next.js 16, React 19, TypeScript, Tailwind 4, Mapbox GL 3, Zustand, suncalc.
- **State** — `moon-transit-store`, `observer-store`.
- **Domain** — `lib/domain` (astro, geometry, transit screening); flight providers in `lib/flight`.

