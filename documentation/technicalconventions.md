# Technical conventions — Moon Transit

Conventions for anyone extending this codebase: patterns, tooling, and safe-change guidelines.

## Language and i18n

- **User-facing UI copy is English** (see `layout`, `HomePageClient`, field components, map overlay strings).
- **Comments** in code may be Croatian or English; prefer **English** for public APIs and `architecture.md` / this file. Inline comments that explain a tricky formula can stay in the author’s language.
- **Locale for dates/numbers in UI** — e.g. `toLocaleString("en-US", …)` for consistency.

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

## State (Zustand)

- **Two stores** — `useMoonTransitStore` (flights, time, map view, provider) and `useObserverStore` (observer, map focus, lock). Don’t merge without a design discussion.
- **Selectors** — Prefer `useStore(s => s.field)` to limit re-renders.
- **Side effects** — Put in `useEffect` in components or in explicit hooks (`src/hooks`), not inside store setters, unless the effect is a single sync update.

## Data and geometry

- **WGS84** — Lat/lng order matches GeoJSON: `[lng, lat]` in coordinates; `{ lat, lng }` in app types.
- **Angles** — Track/azimuth: **degrees**, clockwise from true north, range normalized per function contract (see `wgs84`, `useActiveTransits`, etc.).
- **Domain code** under `lib/domain` should stay **testable and framework-agnostic** (no `useMoonTransitStore` inside pure geometry).

## Mapbox

- **Token** — `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` only on the client for `mapboxgl.Map`. Never commit real tokens; document in `README` only the variable name.
- **Transpile** — `mapbox-gl` is listed in `next.config.ts` `transpilePackages` for the bundler.
- **New layers** — Add source + layer in `MapContainer`; keep a single place responsible for `setData` / `addImage` to avoid desync.
- **Icon pipeline** — Prefer **canvas → PNG** for custom icons if SVG `data:` URLs fail in the wild.

## Flight provider contract

- Implement `**getFlightsInBounds({ bounds, … })`** to return a **readonly** array of `FlightState`.
- **Track** — Provide `trackDeg` when known; it drives map symbol rotation and extrapolation. Null is allowed; extrapolation will not guess direction.
- **Optional** — `getRouteLineFeatures` for polylines; `getRouteCorridorStats` for OpenSky region stats in the UI.

## API / network

- **OpenSky** — Only through the Next.js route `GET /api/opensky/states` (CORS proxy). No direct browser calls to `opensky-network.org`.
- **Caching** — Route handler uses `cache: "no-store"`; adjust if you add rate limits or SWR on the client.

## Testing and quality

- **No test runner is configured in `package.json` by default** — if you add Vitest/Playwright, document commands here and in `README`.
- Before PR: `npm run build`, `npx tsc --noEmit`, and `npm run lint`.

## Git and changelog

- Log **user-visible** and **architectural** changes in `documentation/changelog.md` (keep newest first).
- Commit messages: clear, imperative subject line; body optional for complex changes.

## Security

- **No secrets in client** except public Mapbox token (`NEXT_PUBLIC_`*).
- **Geolocation** — Only in secure context (`https`); the app already guards with `isSecureContext` where relevant.

## File naming

- **Components** — `PascalCase.tsx`
- **Hooks** — `useName.ts` in `src/hooks/`
- **Util modules** — `kebab-case` or `camelCase` file names; match existing neighbors in the same folder

When in doubt, mirror the **nearest existing** file in the same layer (`components`, `lib`, `hooks`).