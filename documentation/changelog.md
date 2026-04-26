# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
where version bumps are made for releases (currently `0.x`).

## [Unreleased]

### Added

- **Moon path (map)** — 12 h ground track of the moon’s direction from the ephemeris anchor: `AstroService.getMoonPathSamples` (24 points / 30 min) → `GeometryEngine.buildMoonPathLineCoordinates`; GeoJSON sources `moon-path-geo` (dashed `LineString`) and `moon-path-labels-geo` (2-hourly hour labels on a `symbol` layer). Uses a **shorter ray length** than the long moon–route intersection azimuth so the path stays in regional map scale. Updates when the observer or `referenceEpochMs` (time anchor + offset) changes. Label color matches the camera marker border (amber).

### Changed

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

