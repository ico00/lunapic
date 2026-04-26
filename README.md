# Moon Transit

Web app for planning and visualizing **aircraft transits in front of the Moon**: map, moon ephemeris, ADS-B–backed (or static) flight data, and photographer-oriented tools (countdown, suggested shutter, compass aim, field export).

**Using the app (non-developers):** [documentation/user-guide.md](./documentation/user-guide.md) — what to click, what the map means, and how to read the results in plain language.

**Source:** [github.com/ico00/lunapic](https://github.com/ico00/lunapic)

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Mapbox GL JS, Zustand, suncalc (moon position).

## Documentation (start here)


| Document                                                                         | Audience              | Purpose                                                                        |
| -------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| **[documentation/user-guide.md](./documentation/user-guide.md)**                 | **Using the app**     | Workflow, what each map layer means, how time and the observer work (no code). |
| [documentation/architecture.md](./documentation/architecture.md)                 | Developers            | System design, data flow, major modules, extension points                      |
| [documentation/technicalconventions.md](./documentation/technicalconventions.md) | Developers            | Code style, patterns, environment, how to add features safely                  |
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

Open [http://localhost:3000](http://localhost:3000).

### Environment variables


| Variable                   | Required          | Description                                                                                                                                      |
| -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | **Yes** (for map) | Mapbox access token. Without it, the map shows a setup message.                                                                                  |
| `NEXT_PUBLIC_FIELD_PERF`   | No                | If `1`, enables the in-map **field performance** panel (dev / field tuning). See [documentation/performance.md](./documentation/performance.md). |


Example `.env.local`:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token
```

**OpenSky:** the browser does not call OpenSky directly. The app uses the Next.js route `GET /api/opensky/states` as a CORS-free proxy. No key is required for basic OpenSky public usage.

## Scripts


| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Development server (Turbopack)                     |
| `npm test`         | Unit tests (Vitest, watch)                         |
| `npm run test:run` | Unit tests (single run)                            |
| `npm run test:e2e` | E2E (`playwright test`; run `npm run build` first) |
| `npm run build`    | Production build                                   |
| `npm start`        | Run production build                               |
| `npm run lint`     | ESLint                                             |
| `npx tsc --noEmit` | Typecheck only                                     |


## Flight data modes

- **static** — Positions on routes from `src/data/routes.json`; route polylines; track from the active route segment near the view center.
- **opensky** — Live (best-effort) ADS-B via OpenSky, bounded by the map view.
- **mock** — Hard-coded test aircraft.

Select in the sidebar (“Provider”).

## Continuous integration

On push and pull requests to `main` or `master`, `[.github/workflows/ci.yml](.github/workflows/ci.yml)` runs ESLint, Typecheck, `npm run test:run`, `npm run build`, and a Playwright smoke test. Set repository secret `NEXT_PUBLIC_MAPBOX_TOKEN` (optional) if you want the E2E run to use a real Mapbox token in the build.

## License / package meta

- `"private": true` in `package.json` (app not published as a library).
- Fonts: Geist (via `next/font`).

## Contributing

Read [documentation/technicalconventions.md](./documentation/technicalconventions.md) before large refactors. Record notable changes in [documentation/changelog.md](./documentation/changelog.md).