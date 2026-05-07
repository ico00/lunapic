# Self-hosted deployment (cPanel / sub-URL)

This project can run on **Node.js** in cPanel (or similar) when the public URL is a **subpath** (e.g. `https://example.com/LunaPic`), not the domain root. The following is the **authoritative** layout for that setup; the root [README](../README.md) defers here for runbooks.

## Single source of truth: `cpanelBasePath.cjs` (project root)

- Exports a **string** with a leading slash and **no** trailing slash, e.g. `"/LunaPic"`. Must match the cPanel **Application URL** path segment.
- Drives, via `next.config.ts`:
  - **`basePath`** — Next.js routes, `/_next` assets, and `public/` files are all served under this prefix.
  - **`env.NEXT_PUBLIC_BASE_PATH`** — same value inlined at build time for **client** code.
- Drives `server.js` (Passenger often forwards requests **without** the subpath; the server rewrites the path before the Next handler).
- Drives Playwright `webServer.url` and `e2e/basePath.ts` for E2E.

If you change the subpath, edit **only** `cpanelBasePath.cjs`, then `npm run build` and redeploy.

## Entry process

- **`server.js`** — Custom `http` + `next()` (see [Next “custom server”](https://nextjs.org/docs/app/building-your-application/configuring/custom-server)). Start with:
  - `npm run start:cpanel` (see root `package.json`), or
  - cPanel “Application startup file” → `server.js` with `NODE_ENV=production`.
- **Do not** set `output: "standalone"` for this path unless you switch to the generated `.next/standalone` server; this repo is set up for the project-root `server.js` + full `.next` + `node_modules` layout.
- Binds to `PORT` and `0.0.0.0` by default (see `server.js`); override with `BIND_HOST` / `HOST` if your host requires it.

## Local development

With a non-empty `cpanelBasePath.cjs`, the app is at **`http://localhost:3000`** + that path (e.g. `http://localhost:3000/LunaPic`). The site root `http://localhost:3000/` is not the app home in that case.

## Client code and `basePath`

Next does **not** automatically prefix these:

| Use case | Use |
| -------- | --- |
| `fetch` to App Router `Route Handlers` (e.g. OpenSky proxy) | `appPath("/api/...")` from `src/lib/paths/appPath.ts` |
| URLs to files under `public/` (e.g. Mapbox `Image` for plane icon) | `appPath("/plane_…svg")` (see `mapOverlayConstants.ts`) |

Relying on `"/api/…"` or `"/file.svg"` hits the **domain root** and returns 404 or wrong asset behind a sub-URL.

## What to put on the server

The production host does **not** need to mirror the full git tree.

**Required to run** (after a successful `next build` on a machine with the same `cpanelBasePath.cjs`):

- `.next/`, `public/`, `node_modules/`, `package.json` (+ lockfile optional but recommended)
- `server.js`, `next.config.ts`, `cpanelBasePath.cjs`

**Not required** for run-only: `src/`, `e2e/`, tests, `documentation/`, `.git/`, and most dev config — as long as `.next` is complete.

**To build on the server** (`git pull` + `npm run build`), you need a **full** checkout (including `src/`, `tsconfig.json`, etc.) and a normal `npm install` (devDependencies required for the build on many hosts).

**Secrets:** prefer cPanel “Environment” (e.g. `NEXT_PUBLIC_MAPBOX_TOKEN`) or a server-only `.env` that is not committed, instead of copying `.env.local` from a laptop.

## cPanel notes

- Application root in the Node UI should point at the app directory (may be **outside** `public_html`; that is normal).
- Rebuild the app after any change to `cpanelBasePath.cjs` or to client/server code; restart the Node app when only runtime files change.
- You may remove macOS `__MACOSX` directories if they appear in uploads.
- For correct SEO canonicals/sitemap on production, set `NEXT_PUBLIC_SITE_URL` to the full public app URL (with subpath), e.g. `https://example.com/LunaPic`.

## E2E

`playwright.config.ts` reads `cpanelBasePath.cjs` so the smoke tests hit the same base as production. `npm run test:e2e` still expects `npm run build` first and a successful `next start` on port 3000.

## Related

- `src/lib/paths/appPath.ts` — `appPath` helper
- `server.js` — HTTP server and path alignment
- [changelog](changelog.md) — recent hosting-related fixes
