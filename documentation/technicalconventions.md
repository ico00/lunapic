# Technical conventions — LunaPic

Conventions for anyone extending this codebase: patterns, tooling, and safe-change guidelines.

## Language and i18n

- **User-facing UI copy is English** (see `layout`, `HomePageClient`, field components, map overlay strings).
- **Comments** in code may be Croatian or English; prefer **English** for public APIs and `architecture.md` / this file. Inline comments that explain a tricky formula can stay in the author’s language.
- **Locale for dates/numbers in UI** — datetime shown to the user (e.g. simulated anchor in `TimeSliderPanel`) uses **`en-GB`** so the calendar reads **dd/mm/yyyy** with **`hour12: false`** (24-hour clock). Use the same pattern elsewhere for consistency.

## TypeScript

- **Strict mode** on (`tsconfig.json`).
- Prefer **explicit types** on exported functions and public store shapes.
- Path alias: `**@/`* → `src/*`** (no deep relative `../../../` for cross-feature imports if avoidable).
- `FlightProviderId` and other string unions: extend in **one** place (`src/types/…`) and import everywhere.

## React / Next.js

- **App Router** — `src/app/`. The main page is a client tree starting from `page.tsx` → `HomePageClient` (see `"use client"` at top of client modules).
- **Server components** by default; add `"use client"` only for hooks, Zustand, Mapbox, browser APIs.
- **Dynamic import** for `MapContainer` in `HomePageClient` to avoid loading Mapbox on the server (`ssr: false`).

Before relying on “classic” Next 12 patterns, read `**AGENTS.md`** (Next 16 differences).

## Styling

- **Tailwind CSS 4** — utility classes in components; `globals.css` for global rules / animations.
- **No separate design-system package** — follow existing classes (zinc/emerald/amber/sky palette in sidebar and map controls).

## Combobox (dropdown) pattern

For **any new discrete choice** in the main shell / sidebar (and generally anywhere a `ShellSectionCard` or other clipped container would cut off a native menu), **do not use** a bare HTML `<select>`.

1. **Follow the existing combobox implementation** — shared classes live in [`src/lib/ui/shellComboboxStyles.ts`](../src/lib/ui/shellComboboxStyles.ts) (`shellComboboxTriggerClass`, `shellComboboxListboxPortalClass`, `shellGlassPanelClass`, `shellAccentCheckboxClass`). Reference implementations: [`FlightProviderSelect.tsx`](../src/components/shell/FlightProviderSelect.tsx) (flight source), [`CameraPresetSelect.tsx`](../src/components/shell/CameraPresetSelect.tsx) (camera body preset), and [`CameraSensorSelect.tsx`](../src/components/shell/CameraSensorSelect.tsx) (sensor type; supports `disabled` when a **fixed** preset locks the format).  
   - **Trigger:** `<button type="button">` — use **`shellComboboxTriggerClass`** (zinc border/fill, **blue** hover ring `hover:border-blue-500/35`, `focus:ring-blue-500/25`), full width, fixed height `h-9`, trailing chevron SVG that rotates when open.  
   - **Menu:** `role="listbox"` with **`shellComboboxListboxPortalClass`**, portaled with **`createPortal(…, document.body)`**; **`fixed`** position from `getBoundingClientRect()` (`top: bottom + 4px`); **`z-[280]`**; inline `style` like the references (`minWidth: trigger width`, `width: max-content`, `maxWidth: min(100vw - 1rem, 22rem)`); **`clampFloatingMenuLeft`** after open so the panel stays in the viewport. `max-h-60 overflow-y-auto`. Selected option row: `bg-blue-500/20` + `text-yellow-400`; unselected: zinc hover.  
   - **Close:** mousedown outside, `Escape`, and capture-phase **`scroll`** on `window`. **Important:** in the capture phase, scrolling inside the portaled listbox (or the trigger) still fires on `window` — the **`scroll`** handler must **ignore** events whose **`event.target`** is **contained in** the menu or trigger `ref`, otherwise `overflow-y-auto` menus close while the user scrolls the option list (`FlightFiltersPanel`, `FlightProviderSelect`, `CameraPresetSelect`, `CameraSensorSelect`).
   - **Hydration:** use **`useHasMounted`** before portaling the listbox.  
   - **A11y:** `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls` on trigger; options `role="option"`, `aria-selected`; `onMouseDown` preventDefault on options to avoid blur-before-click issues.  
   - **Flight source nuance:** the **OpenSky** and **ADS-B One** menu rows use **`role="presentation"`** with inner checkboxes (`data-testid="live-feed-opensky"` / `live-feed-adsbone`) so users can enable **both** REST feeds without a second control block. **`static`** / **`mock`** are not listed (see `FLIGHT_PROVIDER_COMBO_IDS` in `flight-provider.ts`). **Playwright:** the trigger **toggles** open/closed — after one click opens the portal, **do not** click the trigger again between checkbox steps; a second click **closes** the menu and **unmounts** those inputs (tests that “wait forever” for `live-feed-*` are often hitting this).

2. **E2E** — Set **`data-testid="<feature>-select"`** (or similar) and **`data-value={current}`** on the trigger button so Playwright can assert value; for **`camera-sensor-select`** and **`camera-preset-select`**, click `role=option` by name. **Flight source** (`data-testid="flight-provider-menu"`) uses only those **checkbox** test ids — no static/mock rows and no `role="option"` rows.

3. **Reuse** — If a third or fourth picker appears, consider extracting a small shared **`ShellCombobox`** (props: `value`, `onChange`, `options`, `ariaLabel`, `testId`) that both existing components adopt; until then, **copy the pattern** rather than introducing a divergent native `<select>`.

Native `<select>` remains acceptable only for **non-shell** contexts where clipping is impossible (e.g. raw HTML forms outside the app shell), and should be the exception.

## State (Zustand)

- **Two stores** — `useMoonTransitStore` (flights, time, map view, provider, rise/set + `ephemerisRefetchKey` for `useAstronomySync`, selected flight) and `useObserverStore` (observer, map focus, lock). Don’t merge without a design discussion. **Deeper rationale:** `src/stores/README.md` (intentional single aggregate for the moon-transit slice; optional future split is documented in `documentation/architecture.md`). **Astronomy:** do not key `useAstronomySync` only on `referenceEpochMs` — use `ephemerisRefetchKey` + observer so UTC midnight while scrubbing does not replace `getMoonTimes` for the wrong day.
- **Selectors** — Prefer `useStore(s => s.field)` to limit re-renders.
- **Side effects** — Put in `useEffect` in components or in explicit hooks (`src/hooks`), not inside store setters, unless the effect is a single sync update.

## Adding a new feature (checklist)

1. **Domain / math** — New pure logic → `lib/domain/…` (new file or subfolder), no React or Zustand. Export types from `src/types` when shared.
2. **External data** — New flight or weather-like source → implement `IFlightProvider` (or a small service module) and wire via registry; avoid ad-hoc fetches in components.
3. **Orchestration** — Connect stores + services in a **hook** under `src/hooks/` (e.g. `use…Sync`, `use…Orchestration`), not inside presentational components.
4. **UI** — New sidebar content → a **panel** under `src/components/shell/panels/` (or `components/<feature>/`) with **props**; keep `HomePageClient` as composition only, not 200+ lines of inline JSX and logic. **Dropdowns** in the shell → follow **Combobox (dropdown) pattern** (below), not native `<select>`.
5. **Map** — New Mapbox behavior → extend `lib/map/` (`registerMoonTransitLayers` / new helper), `useMapGeoJsonSync` or a dedicated hook; **do not** add business rules inside `MapContainer` — keep it a thin shell.

## Data and geometry

- **WGS84** — Lat/lng order matches GeoJSON: `[lng, lat]` in coordinates; `{ lat, lng }` in app types.
- **Angles** — Track/azimuth: **degrees**, clockwise from true north, range normalized per function contract (see `wgs84`, `useActiveTransits`, etc.).
- **Domain code** under `lib/domain` should stay **testable and framework-agnostic** (no `useMoonTransitStore` inside pure geometry). **`GeometryEngine`** is a thin façade; implementations live in `geometryEngineMoonRay.ts` and `geometryEnginePhotographer.ts` next to the façade.

## Moon ephemeris (astronomy-engine)

- **Always use `AstroService`** — `src/lib/domain/astro/astroService.ts` is the single entry point for all moon-position and phase calculations. Do **not** call `suncalc` directly for moon azimuth, altitude, phase, or illumination anywhere in the application.
- **`astronomy-engine` v2.1.19** — USNO-grade ephemeris (<1 arcminute accuracy). `getMoonState()` in `moon.ts` uses `Astronomy.Equator()` + `Astronomy.Horizon()` with atmospheric refraction. Phase/illumination uses `Astronomy.MoonPhase()` and angular elongation.
- **Observer elevation** — Always pass `observer.groundHeightMeters` as the 4th argument to `getMoonState(lat, lng, epochMs, observerElevM)`. Omitting it defaults to 0 m (sea level) and silently degrades refraction accuracy for elevated observers. Every call site in the codebase passes this argument.

## Mapbox

- **Token** — `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` only on the client for `mapboxgl.Map`. Never commit real tokens; document in `README` only the variable name.
- **Transpile** — `mapbox-gl` is listed in `next.config.ts` `transpilePackages` for the bundler.
- **New layers** — Add sources and layers in `lib/map/registerMoonTransitLayers` (or a dedicated init module); keep `useMapGeoJsonSync` as the place that calls `setData` for GeoJSON, so the map does not desync. `MapContainer` + `useMoonTransitMap` stay thin.
- **Icon pipeline** — Prefer **canvas → PNG** for custom icons if SVG `data:` URLs fail in the wild.

## Flight provider contract

- Implement `**getFlightsInBounds({ bounds, … })`** to return a **readonly** array of `FlightState`.
- **Track** — Provide `trackDeg` when known; it drives map aircraft model rotation (yaw) and extrapolation. Null is allowed; extrapolation will not guess direction.
- **Optional** — `getRouteLineFeatures` for polylines; `getRouteCorridorStats` for OpenSky region stats in the UI.
- **Store ingest (OpenSky UX)** — After the provider returns, `moon-transit-store` applies **`mergeFlightsWithOpenSkyRetention`** (see `src/lib/flight/mergeFlightsWithOpenSkyRetention.ts`); do not duplicate that logic inside a provider unless you have a strong reason.

## API / network

- **OpenSky** — Only through the Next.js route `GET /api/opensky/states` (CORS proxy). No direct browser calls to `opensky-network.org`. The client must call this route with **`appPath("/api/opensky/states?…")`** in [`src/lib/paths/appPath.ts`](../src/lib/paths/appPath.ts) whenever `basePath` is set (inlined via `NEXT_PUBLIC_BASE_PATH` from [cpanelBasePath.cjs](../cpanelBasePath.cjs)). Plain `fetch("/api/…")` hits the domain root and fails behind a sub-URL.
- **ADS-B One** — The client uses same-origin `GET /api/adsbone/point` by default (`appPath`, like OpenSky). Browser-direct `https://api.adsb.one/…` fallback is **off by default** to avoid CORS console spam on non-whitelisted origins, and can be enabled only with `NEXT_PUBLIC_ADSBONE_ALLOW_DIRECT=1` for debug/special deployments. `NEXT_PUBLIC_ADSBONE_DISABLE_DIRECT=1` still hard-disables direct calls.
- **Caching** — Route handler uses `cache: "no-store"`; adjust if you add rate limits or SWR on the client.

## Sub-URL (self-host / `basePath`)

- **Config** — See [documentation/deployment-cpanel.md](./deployment-cpanel.md). One value in `cpanelBasePath.cjs` sets Next `basePath` and `NEXT_PUBLIC_BASE_PATH`.
- **New client `fetch` to this app** — Always use `appPath("/api/…")` (or a helper that includes the same prefix).
- **New asset under `public/`** (Mapbox `Image`, `<img>`, etc.) — Use `appPath("/file.ext")` or the constant in `mapOverlayConstants.ts` that already does.
- **Next `Link` / `next/router`** — `basePath` is applied automatically; no `appPath` for those.

## SEO conventions (metadata / indexing)

- **Metadata location** — Keep global defaults in `src/app/layout.tsx` and override per-route metadata in each route segment (`page.tsx` or nested `layout.tsx`) when snippets should differ.
- **Canonical URL authority** — Use `src/lib/seo/site.ts` helpers (`getSiteUrl`, `getAbsoluteUrl`) instead of hardcoding domains in metadata/robots/sitemap.
- **Environment requirement** — Set `NEXT_PUBLIC_SITE_URL` in production to the exact public app URL (include subpath if used). Example: `https://example.com/LunaPic`.
- **Crawler files** — Keep `src/app/robots.ts` and `src/app/sitemap.ts` in sync with published routes; add new public pages there when introduced.
- **Structured data** — Prefer JSON-LD for machine-readable sections (e.g. FAQ). Keep schema text sourced from local copy, not user input.

## Testing and quality

- **Unit tests (domain)** — [Vitest](https://vitest.dev/) 3. Co-located `src/lib/domain/**/*.test.ts` (WGS84/ENU, `horizontal`, line-of-sight, sky separation, `screening`, `computeShotFeasibleFlightIds`, `balconyTransitWatchIdeal`, `getMoonState`, `nasaMoonPhaseFrame`, `standCorridorQuads`, `geometryEngineMoonRay` / `geometryEnginePhotographer`, `AstroService` moon path; `src/lib/format/moonFieldNote.test.ts`; `src/lib/audio/` has no tests but `fieldAudio.ts` backs field sounds). Run once: `npm run test:run`. Watch: `npm test`.
- **E2E smoke** — [Playwright](https://playwright.dev/) 1, Chromium. `e2e/smoke.spec.ts` (shell + map column), `e2e/flight-source.spec.ts` (flight provider **combobox** — trigger `data-testid="flight-provider-select"` / `data-value`, menu `flight-provider-menu`, live-feed **checkboxes** `live-feed-opensky` / `live-feed-adsbone`). New shell comboboxes should expose the same **`data-testid` / `data-value`** pattern on the trigger (see **Combobox (dropdown) pattern** above). Run: `npm run build` then `npx playwright test` (or `npm run test:e2e`). First time: `npx playwright install chromium`. `webServer` in `playwright.config.ts` starts `npm run start` on `127.0.0.1:3000` and does not reuse a stale process. Optional: repo secret `NEXT_PUBLIC_MAPBOX_TOKEN` in GitHub Actions so the build can embed a token for a full map in E2E.
- **Field / runtime performance** — `documentation/performance.md` — enable `NEXT_PUBLIC_FIELD_PERF=1` or `localStorage.moonTransitFieldPerf`; in-map violet overlay and hook labels (`useMapMoonOverlayFeatures`, `useMapGeoJsonSync`, `useExtrapolatedFlightsForMap`, Mapbox `moveend`→`idle`, React `Profiler` on the map block). Complement with Chrome Performance tab.
- **CI** — [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): on push/PR to `main` or `master`, after `npm ci` runs `npm audit`, `npm run lint`, `npx tsc --noEmit`, `npm run test:run`, `npm run build`, and Playwright (`npx playwright install` + `npx playwright test` on the runner). Optional: GitHub secret `NEXT_PUBLIC_MAPBOX_TOKEN` for an E2E build that inlines a token.
- Before PR: same as CI locally, or at minimum `npm run lint`, `npm run test:run`, `npx tsc --noEmit`, `npm run build`, `npm audit` (all green), and `npx playwright test` with a prior `npm run build`.

## AR sensor coordinate mapping

Rules for `src/components/field/ArSkyCameraPanel.tsx` and any future AR/field overlay that reads device orientation events.

### Compass heading (`webkitCompassHeading`)

`webkitCompassHeading` returns the **tilt-compensated compass bearing of the camera's horizontal azimuth**, measured clockwise from true north. iOS applies full tilt compensation so the value already represents the direction the rear camera is pointing in the horizontal plane — regardless of how much the phone is tilted up toward the sky.

**Rule:** use `headingDeg` directly as the camera azimuth — **no +180° offset**:

```ts
cameraAzimuthDeg = (pose.headingDeg + calibrationOffsetDeg + 360) % 360
```

Adding +180° inverts the azimuth: the compass shows South where North should be, and all sky objects appear on the opposite side of the screen. `CompassAimPanel` uses `headingDeg` without any offset and produces a correct compass display, confirming that no correction is needed.

### Pitch from `DeviceOrientationEvent.beta`

The rear camera is on the **back** of the phone. The physical mapping is:

| beta | phone posture | camera direction |
|------|--------------|-----------------|
| 90°  | upright portrait, screen toward user | horizontal (pitch = 0°) |
| 180° | flat, screen facing down | straight up (pitch = +90°) |
| 0°   | flat, screen facing up | straight down (pitch = −90°) |

Tilting the phone to view the sky (bringing the screen face-down toward the user) **increases** beta from 90° toward 180°.

**Rule:** `pitch = beta − 90`

```ts
pitch = beta - 90   // NOT (90 - beta)
```

`90 − beta` has the wrong sign: it gives negative pitch when the camera points upward, so sky objects appear below the horizon and arrows point the user in the wrong direction.

### Off-screen arrow direction

The off-screen edge arrow uses `dyDeg = altitudeDeg − pitchDeg`:

- `dyDeg > 0` → target is **above** the camera centre → arrow points **up** (`rotate(0deg)` on ▲)
- `dyDeg < 0` → target is **below** the camera centre → arrow points **down** (`rotate(180deg)` on ▲)

Do **not** swap these. If the arrow shows ▼ when the target is above the frame, the user tilts toward it and moves the target further off-screen.

### Smoothing and outlier rejection

Raw `webkitCompassHeading` readings can jump spuriously (magnetic glitches, fast phone movement). Two-stage filtering is applied:

1. **Outlier rejection** — discard any reading that differs by more than 45° from the current smoothed heading. A realistic fast hand rotation (~360°/s at 60 Hz) produces at most ~6°/frame, so 45° can only be a sensor glitch.
2. **Warmup / steady-state alpha** — use a higher alpha for the first ~60 samples (~1 s at 60 Hz) so the overlay locks on quickly after opening, then switch to a low alpha for long-term stability:

```ts
const alpha = sampleCount < 60 ? 0.25 : 0.06;
smoothedHeading = smoothAngleDeg(prev, next, alpha);
```

Pitch uses a fixed `lerp` alpha of 0.12. Do **not** raise the steady-state heading alpha above ~0.08 — higher values allow magnetic glitches to cause visible jumps.

### Compass accuracy and magnetic interference

`webkitCompassAccuracy` (iOS-only, in degrees) indicates how reliable the magnetometer reading is. Values above ~20° mean significant local interference (metal window frames, reinforced concrete, electronics).

- Display the accuracy badge next to the compass rose: **green ≤ 10°**, **amber ≤ 20°**, **red > 20°**.
- Show a red warning text overlay when accuracy **exceeds 15°** (previously 30° — lowered because ±26° error shifts all sky objects by 26° horizontally, making the AR effectively useless).
- The AR module is a **visual aid only** — the core transit calculations (moon position, aircraft geometry, transit screening) do not use the magnetometer and are unaffected by compass accuracy.

### AR overlay aircraft filter

Only aircraft with `altitudeDeg >= 0°` are shown in the AR overlay. Aircraft technically below the horizon (negative elevation) are geometrically valid but invisible to the eye and should not appear as overlay labels. The previous threshold was −5°.

### AR moon tap calibration (`calibrationOffsetDeg`)

When the magnetometer is disturbed, the user can correct the horizontal offset by tapping where the moon is actually visible in the camera frame. The app computes:

```ts
calibrationOffsetDeg = normalizeSignedAngleDeg(moon.azimuthDeg − headingDeg − tapDxDeg)
// where tapDxDeg = (tapX / viewportW − 0.5) × AR_H_FOV_DEG
```

This solves for the offset that makes the moon marker land exactly at the tapped pixel. The "Cal ☽" button in the AR bottom bar enters calibration mode; tapping anywhere sets the offset. A green `Cal +X°` label is shown while a non-zero offset is active; tapping the button again resets it to 0.

## Git and changelog

- Log **user-visible** and **architectural** changes in `documentation/changelog.md` (keep newest first).
- Commit messages: clear, imperative subject line; body optional for complex changes.

## Security

- **No secrets in client** except public Mapbox token (`NEXT_PUBLIC_`*).
- **Geolocation** — Only in secure context (`https`); the app already guards with `isSecureContext` where relevant.
- **Dependencies** — After changing `package.json`, run `npm install` and `npm audit`. The repo uses an **`overrides.postcss` pin** (≥8.5.10) to patch nested PostCSS that Next’s tree may lock behind an older range; do not remove it without re-checking the audit. Keep `@playwright/test` in the range that passes `npm audit` (browser install SSL). CI runs `npm audit` on every build.

## File naming

- **Components** — `PascalCase.tsx`
- **Hooks** — `useName.ts` in `src/hooks/`
- **Util modules** — `kebab-case` or `camelCase` file names; match existing neighbors in the same folder

When in doubt, mirror the **nearest existing** file in the same layer (`components`, `lib`, `hooks`).