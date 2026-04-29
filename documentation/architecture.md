# Architecture — Moon Transit

This document explains how the application is structured, how data moves through it, and where to extend behavior without breaking assumptions.

## Goals (domain)

1. **Observer** — a fixed point on the ground (lat, lng, optional ground height). The moon’s apparent position and all geometry are computed for this point.
2. **Time** — a wall-clock anchor with a **simulated** offset on a **full UTC calendar-day window** (00:00–24:00 for the day anchored by `timeAnchorMs` / sync): `referenceEpochMs = timeAnchorMs + timeOffsetMs` is the “current simulation time”. **Moonrise / moonset** from suncalc still drive ephemeris UI and which **map moon-path arc** is drawn as the primary (visible) segment, but they no longer limit how far the slider can scrub. Initial load and **Sync** clamp time into that day and bump ephemeris refresh.
3. **Flights** — `FlightState[]` from a pluggable **flight provider** (Strategy pattern), loaded for the current map bounds.
4. **Transit / alignment** — compare moon azimuth with aircraft position (from altitude) to find “candidates” and “active” alignments within tolerance, plus photographer tools (line-of-sight rate, duration, suggested shutter).
5. **Map** — Mapbox GL: routes, **moon path** (primary dashed arc for the visible rise→set window when known, plus a **low-contrast full-day** path for the whole UTC day), **simulated-instant marker** on the path, **moon azimuth** at `referenceEpochMs`, optional **NOW** wall-clock moon pointer (cyan), static-route intersections, flights as symbols, observer marker, **selected-aircraft stand** (cyan trapezoid + zero-offset spine for 3D line-of-sight at `referenceEpochMs`), short **selected-flight trajectory** when an aircraft is picked, optional “golden” UI when alignment is within a critical angle.

## High-level layout

```mermaid
flowchart TB
  subgraph client [Browser]
    Page[app/page.tsx]
    Shell[HomePageClient]
    Map[MapContainer]
    Page --> Shell
    Shell --> Map
  end

  subgraph state [Zustand]
    MTS[moon-transit-store]
    OBS[observer-store]
  end

  subgraph domain [lib/domain]
    Astro[astro / AstroService]
    Geo[geometry / GeometryEngine]
    Screen[transit/screening]
  end

  subgraph flight [lib/flight]
    Reg[flightProviderRegistry]
    Prov[IFlightProvider impls]
  end

  Shell --> MTS
  Shell --> OBS
  Map --> MTS
  Map --> OBS
  MTS --> Reg
  Reg --> Prov
  Shell --> Astro
  Shell --> Geo
  Geo --> Screen
```



- **UI shell** — `src/components/shell/HomePageClient.tsx` — sidebar (izvori, Mjesec, kandidati, tranziti) i alati (fotograf, kompas, polje); ispod `md` karta s `h-dvh` ispunjava srednji segment, kontrole u donjem „decku” s dva taba, jedna instanca mape. Na desktopu tri stupca kao prije. Map u drugom stupcu; map mora ostat **jedna** `MapContainer` instanca.
- **Map** — `src/components/map/MapContainer.tsx` — Mapbox, GeoJSON sources, **must** match store updates via effects (`loadFlightsInBounds` on move, etc.).

## State stores

### `useMoonTransitStore` (`src/stores/moon-transit-store.ts`)


| Field / action                                     | Role                                                                                                                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeAnchorMs`, `timeOffsetMs`, `referenceEpochMs` | Ephemeris and screening use `referenceEpochMs` as the “current simulation time”. The slider is clamped to **`getTimeSliderWindowMs`** — a **full UTC day** `[t0, t1]` whose calendar day is anchored from `timeAnchorMs` (stable across scrubbing) so the window does not roll over unexpectedly at the right edge. |
| `moonRise`, `moonSet`, `moonRiseSetKind`           | Suncalc rise/set for ephemeris panels and for **which segment** of the day is highlighted as the primary **visible** moon path on the map; **not** the slider extent. From `AstroService.getMoonTimes` via `useAstronomySync`.                                                                                               |
| `ephemerisRefetchKey`                              | Bumped in `syncTimeToNow` so `useAstronomySync` re-fetches `getMoonTimes` for the UTC day of the **current** `referenceEpochMs` without re-running on every slider tick (avoids UTC-midnight desync on the path). |
| `setMoonRiseSet`                                   | Writes rise/set; may re-clamp `timeAnchorMs` / `referenceEpochMs` to the new window.                                                                                                                              |
| `mapView`                                          | Center, zoom, pitch, bearing — updated when the user pans the map.                                                                                                                                                |
| `flightProvider`                                   | `mock` / `static` / `openSky` (see `FlightProviderId`).                                                                                                                                                           |
| `flights`                                          | Last loaded snapshot; **not** real-time until next bounds load.                                                                                                                                                   |
| `selectedFlightId`                                 | Drives photographer tools, list highlighting, and the **stand** overlay on the map.                                                                                                                               |
| `openSkyLatencySkewMs`                             | Manual time skew for display extrapolation (field section).                                                                                                                                                       |
| `syncTimeToNow`                                    | “Sync” and initial shell layout: reset simulated time to now (clamped), bump `ephemerisRefetchKey`.                                                                                                               |
| `loadFlightsInBounds`                              | Invokes the active `IFlightProvider` and sets `flights` / `error` / `isLoading`.                                                                                                                                  |


**Design note (bounded context):** The store combines **simulated time**, **map view state**, and **flight loading + selection** in one Zustand slice. This is an **intentional aggregate** for a small app: a single `loadFlightsInBounds` can depend on time and provider without cross-store sync. A future split into `timeStore` / `flightsStore` / `mapViewStore` is optional; see `src/stores/README.md` (Croatian summary), `documentation/optimization-and-refactoring.md`, and `documentation/technicalconventions.md` (State + feature checklist) for the refactor log, trade-offs, and where to add new behavior.

### `useObserverStore` (`src/stores/observer-store.ts`)


| Field / action           | Role                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `observer`               | `{ lat, lng, groundHeightMeters }` — default near Zagreb; can be GPS or “set from map center”. |
| `observerLocationLocked` | When true, user cannot accidentally move the observer.                                         |
| `mapFocusNonce`          | Incremented to ask `MapContainer` to `flyTo` the observer.                                     |


**Rule:** All moon/plane relative math should use `observer` from this store, not the map’s internal center, unless the feature explicitly is “set observer from view”.

## Flight providers (Strategy)

- **Interface:** `src/types/flight-provider.ts` — `IFlightProvider`: `getFlightsInBounds(FlightQuery)`, optional `getRouteLineFeatures`, `getRouteCorridorStats`.
- **Registry:** `src/lib/flight/flightProviderRegistry.ts` — single cached instance per `FlightProviderId`.
- **Implementations:**
  - `mockFlightProvider` — minimal test data.
  - `staticFlightProvider` — `routes.json` + `staticRoutePointAndBearing` for position/track along a segment.
  - `openSkyFlightProvider` — fetches via `GET /api/opensky/states?...` (bounds), parses states in `parseOpenSkyStates.ts`.

Adding a new source: implement `IFlightProvider`, register in the registry, add the id to `FLIGHT_PROVIDER_IDS` and the sidebar selector.

## Domain layer

- `**lib/domain/astro/`** — `AstroService.getMoonState` wraps moon ephemeris (suncalc-based helpers in `moon.ts`) → `MoonState` (azimuth, altitude, apparent radius, …). `**getMoonTimes**` (suncalc) → `moonRise` / `moonSet` / circumpolar kind in the store, updated by `**useAstronomySync**` (re-fetch on observer change and when `ephemerisRefetchKey` bumps in `syncTimeToNow` — *not* on every slider change; avoids swapping the suncalc UTC day at UTC midnight and desyncing rise/set metadata vs scrubbing). `**getMoonPathMapSpec**` still uses the **visible** rise/set window for the **primary** dashed moon path and its tick labels; a separate **full-day** sample strip uses the UTC calendar day. **`getTimeSliderWindowMs`** defines the **simulation day** for the slider (full UTC day), distinct from the visible-arc path spec. See `useMapMoonOverlayFeatures`. `**MoonPathSample`** in `src/types/moon.ts`.
- `**lib/domain/geometry/**` — WGS84 helpers, ENU, horizontal line-of-sight (`horizontalToPoint` for 3D azimuth to the aircraft with altitude), moon azimuth line vs static routes, `**buildMoonPathLineCoordinates**` (ground points along a fixed-length ray per sample azimuth) for a moon-path `LineString`, **stand corridor** in `standCorridorQuads.ts` (trapezoid + spine; axis = back-azimuth of horizontal LoS from sub-aircraft point), **photographer** pack (angular rate, slant range, alignment time) in `GeometryEngine` / `lineOfSightKinematics` / `alignmentHint`.
- `**lib/domain/transit/screening.ts`** — Narrows which flights are worth listing as “candidates”.

Keep **pure functions** in `lib/domain` (no React, no `window` except where a module is explicitly “browser”).

## Extrapolation and latency

- `**extrapolateFlightForDisplay`** — Moves the aircraft along **track** for a short time (seconds) for smooth map display. If `trackDeg` is null, returns the state unchanged (no guess direction).
- **OpenSky skew** — `openSkyLatencySkewMs` is added to the “wall time” when extrapolating, so the user can line up ADS-B delay vs reality.

## API routes (Next.js)

- `**/api/opensky/states`** — Server-side `fetch` to `opensky-network.org` with `lamin, lomin, lamax, lomax` query params. Avoids CORS; returns JSON or 502 on upstream error. The **browser** must request this route with the app’s `basePath` prefix (via `appPath` in `OpenSkyFlightProvider`) when not hosted at `/`.

## Map rendering (Mapbox)

- **Sources** — `routes-geo`, `flights-geo`, `moon-azimuth-geo`, `moon-azimuth-now-geo`, `moon-azimuth-now-label-geo`, `moon-path-geo`, `moon-path-full-day-geo`, `moon-path-current-geo`, `moon-path-labels-geo`, `moon-intersections-geo`, `optimal-ground-geo`, `selected-stand-geo`, `selected-stand-spine-geo`, `selected-flight-trajectory-geo`, `selected-flight-trajectory-label-geo` (source ids: `src/lib/map/mapSourceIds.ts`; registration: `registerMoonTransitLayers`; GeoJSON updates: `useMapGeoJsonSync`). **Moon path** — primary dashed `LineString` in the **visible** rise/set window; faint dashed **full-day** guide for the whole UTC day; **circle + label** for the exact simulated instant on the path; **NOW** line + label for wall-clock moon direction. **Selected aircraft** — stand + spine as before; optional short **trajectory** line + `+90s` label when speed/track exist. **Ray length for the path** is shorter than the long moon–route intersection azimuth so the curve stays in a useful map scale. Data follows `referenceEpochMs` and `observer` (same as the simulated time controls).
- **Flights** — Symbol layer with an SVG **plane** icon; rotation from `trackDeg` in feature properties. Fallback circle layer if icon creation fails; layer is `moveLayer`d to the top so it stays **above** stand and other GeoJSON overlays.
- **Observer** — `mapboxgl.Marker` with a custom DOM (camera), not a GeoJSON point.

**Performance:** `loadFlightsInBounds` runs on map move end; don’t add synchronous heavy work in the main map thread without debounce.

## Field / export

- `**lib/field/fieldPlanExport.ts`** — Plain-text “cheat sheet” and a simple PNG (canvas) derived from a snapshot; triggered from the field section in the shell.

## Extension points (checklist for new features)

1. **New flight source** — New `IFlightProvider` + registry + `FLIGHT_PROVIDER_IDS`.
2. **New geometry** — Prefer `lib/domain/geometry` + types in `src/types`.
3. **New UI in sidebar** — `HomePageClient.tsx` composes panel components under `src/components/shell/panels/`; orchestration is in `useHomeShellOrchestration`.
4. **Map layers** — `registerMoonTransitLayers` + `MapContainer` / `useMoonTransitMap` / `useMapGeoJsonSync` so layer setup and `setData` wiring stay explicit and testable in isolation from JSX.

## Deployment and `basePath` (self-host)

- When the app is served under a subpath (e.g. cPanel: `https://host/LunaPic`), a single `cpanelBasePath.cjs` + `server.js` and `appPath` for client fetches and `public` URLs apply; see [deployment-cpanel.md](deployment-cpanel.md). The OpenSky client uses `appPath` so `GET` hits `/LunaPic/api/opensky/…` instead of the domain root.

## Quality assurance (tests, CI, field profiling)

- **Unit tests** — [Vitest](https://vitest.dev/) 3, `src/lib/domain/**/*.test.ts` and `src/lib/perf/fieldPerf.test.ts`. See `documentation/technicalconventions.md` (Testing) for commands.
- **E2E** — Playwright: `e2e/smoke.spec.ts`, `e2e/flight-source.spec.ts`. Requires `npm run build` before `npx playwright test` (see `playwright.config.ts` `webServer`).
- **CI** — `[.github/workflows/ci.yml](../.github/workflows/ci.yml)`: `npm ci` → `npm audit` → `lint` → `tsc` → Vitest → `build` → Playwright (Chromium install on the runner). Full detail: `documentation/technicalconventions.md`.
- **Field / map profiling** (optional) — `documentation/performance.md`, `src/lib/perf/fieldPerf.ts`, in-map `FieldPerfOverlay` when `NEXT_PUBLIC_FIELD_PERF=1` or `localStorage` key `moonTransitFieldPerf`.

## Known limitations (intentional or technical)

- **Flights** are a **snapshot** per bounds load, not a streaming socket.
- **Time slider** does not re-fetch history from OpenSky; it updates `referenceEpochMs` within the **anchored UTC calendar day** and uses the same flight snapshot (documented in UI for OpenSky use). **Suncalc** `moonRise` / `moonSet` re-fetch in `**useAstronomySync`** is tied to **Sync** and **observer** changes (`ephemerisRefetchKey`), not to every move of the slider, so crossing UTC midnight while scrubbing does not replace rise/set metadata used for the **visible** path arc. **Note:** `00:00` and `24:00` on the slider are not identical moon directions — a **lunar day** is about 24h 50m — so the path’s left and right ends intentionally differ slightly.
- **Compass** uses device orientation where available; accuracy varies by device and environment.

## Related files

- App entry: `src/app/page.tsx`, `src/app/layout.tsx`
- Human docs: `README.md` (root), `documentation/README.md` (index), `documentation/deployment-cpanel.md` (cPanel / sub-URL), `documentation/performance.md` (field runtime perf)
- Map token: `NEXT_PUBLIC_MAPBOX_TOKEN`
- Route data: `src/data/routes.json`, `src/data/staticRouteUtils.ts`

