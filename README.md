# LunaPic

Web app for planning and visualizing **aircraft transits in front of the Moon**: map, moon ephemeris, ADS-B–backed (or static) flight data, and photographer-oriented tools (countdown, suggested shutter, compass aim, field export).

**Using the app (non-developers):** [documentation/user-guide.md](./documentation/user-guide.md) — what to click, what the map means, and how to read the results in plain language.

**Source:** [github.com/ico00/lunapic](https://github.com/ico00/lunapic)

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Mapbox GL JS, Zustand, suncalc (moon position).

## Documentation (start here)


| Document                                                                         | Audience              | Purpose                                                                        |
| -------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| **[documentation/user-guide.md](./documentation/user-guide.md)**                 | **Using the app**     | Workflow, what each map layer means, how time and the observer work (no code). |
| [documentation/architecture.md](./documentation/architecture.md)                 | Developers            | System design, data flow, major modules, extension points                      |
| [documentation/technicalconventions.md](./documentation/technicalconventions.md) | Developers            | Code style, **basePath** / `appPath` for sub-URL deploys, environment, how to add features safely |
| [documentation/deployment-cpanel.md](./documentation/deployment-cpanel.md)      | **Self-host / cPanel** | `cpanelBasePath.cjs`, `server.js`, what to deploy, `NEXT_PUBLIC_BASE_PATH` |
| [documentation/changelog.md](./documentation/changelog.md)                       | All                   | Version history and notable changes                                            |
| [documentation/README.md](./documentation/README.md)                             | Developers            | **Index** of the `documentation/` folder                                       |
| [src/stores/README.md](./src/stores/README.md)                                   | Developers (HR)       | Short note: why the moon–transit Zustand slice is one store                    |
| [AGENTS.md](./AGENTS.md)                                                         | Developers (AI/tools) | Note on Next.js 16 in this repo                                                |


## Quick start

```bash
npm install
cp .env.local.example .env.local
# set NEXT_PUBLIC_MAPBOX_TOKEN=pk.…
npm run dev
```

Open the app with the subpath in the path (e.g. [http://localhost:3000/LunaPic](http://localhost:3000/LunaPic) when [cpanelBasePath.cjs](cpanelBasePath.cjs) is `/LunaPic`). If you work without a subpath, use [http://localhost:3000](http://localhost:3000) — see [documentation/deployment-cpanel.md](./documentation/deployment-cpanel.md).

### Environment variables


| Variable                   | Required          | Description                                                                                                                                      |
| -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_BASE_PATH`    | Inlined from `cpanelBasePath.cjs` via `next.config` | **Sub-URL** deploy: must match `basePath` for `fetch`/`appPath` (do not set by hand; change `cpanelBasePath.cjs` only). |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | **Yes** (for map) | Mapbox access token. Without it, the map shows a setup message.                                                                                  |
| `NEXT_PUBLIC_FIELD_PERF`   | No                | If `1`, enables the in-map **field performance** panel (dev / field tuning). See [documentation/performance.md](./documentation/performance.md). |


Dev URL: when [cpanelBasePath.cjs](cpanelBasePath.cjs) is non-empty, use `http://localhost:3000` + that path (see [deployment-cpanel](documentation/deployment-cpanel.md)). Do **not** set `NEXT_PUBLIC_BASE_PATH` manually; it is derived from the same file at build time.


Example `.env.local`:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token
```

**OpenSky:** the browser does not call OpenSky directly. The app uses the Next.js route `GET /api/opensky/states` as a CORS-free proxy; with a sub-URL, the **client** uses `appPath("/api/…")` so the request matches `basePath`. No OpenSky key is required for basic public usage.

**ADS-B One:** proxied through `GET /api/adsbone/point` (same `appPath` pattern). Free community feed; see their FAQ for fair-use / rate limits.

## Scripts


| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Development server (Turbopack)                     |
| `npm test`         | Unit tests (Vitest, watch)                         |
| `npm run test:run` | Unit tests (single run)                            |
| `npm run test:e2e` | E2E (`playwright test`; run `npm run build` first) |
| `npm run build`    | Production build                                   |
| `npm start`        | `next start` (production)                          |
| `npm run start:cpanel` | `node server.js` for **cPanel** / custom server — [deployment-cpanel](documentation/deployment-cpanel.md) |
| `npm run lint`     | ESLint                                             |
| `npx tsc --noEmit` | Typecheck only                                     |


## Flight data modes

The sidebar **Provider** control is a combobox with **two checkboxes** (OpenSky and ADS-B One) on first load both are **on** (merged fetch; trigger **OpenSky + ADS-B One (merged)**). **Static** demo flights and **mock** are not listed in the UI; `routes.json` hull still drives OpenSky bbox logic in code (`StaticFlightProvider` for tests).

- **opensky** — Live (best-effort) ADS-B via OpenSky: bounded **fetch bbox** around the **observer** and demo corridor rules (see `documentation/architecture.md`); **display** uses the union of **map bounds** and the **observer ~100 km disk**, plus short **retention** between snapshots for steadier symbols on mobile. **Not** the same dataset as FlightRadar24 or other trackers — different coverage is normal.
- **adsbone** — Live ADS-B via [ADS-B One](https://adsb.one/faq): by default the app calls same-origin `/api/adsbone/point` (proxy-first, avoids browser CORS failures on non-whitelisted origins). Optional browser-direct fallback exists only with `NEXT_PUBLIC_ADSBONE_ALLOW_DIRECT=1` (debug/special deployments). Community API; ~1 req/s; periodic idle live refresh + short cache windows keep motion smooth.

## Continuous integration

On push and pull requests to `main` or `master`, `[.github/workflows/ci.yml](.github/workflows/ci.yml)` runs ESLint, Typecheck, `npm run test:run`, `npm run build`, and a Playwright smoke test. Set repository secret `NEXT_PUBLIC_MAPBOX_TOKEN` (optional) if you want the E2E run to use a real Mapbox token in the build.

## License / package meta

- `"private": true` in `package.json` (app not published as a library).
- Fonts: Geist (via `next/font`).

## Contributing

Read [documentation/technicalconventions.md](./documentation/technicalconventions.md) before large refactors. Record notable changes in [documentation/changelog.md](./documentation/changelog.md).