# Documentation

Product and engineering docs for **Moon Transit**. The app overview and `npm` commands stay in the repository root: **[README](../README.md)**.

| Document | Purpose |
| -------- | -------- |
| **[architecture.md](./architecture.md)** | System design, data flow, Zustand, providers, map, extension points; **QA** (tests, CI, field perf) |
| **[performance.md](./performance.md)** | In-browser field perf: labels, `NEXT_PUBLIC_FIELD_PERF` / `localStorage`, DevTools |
| **[technicalconventions.md](./technicalconventions.md)** | TypeScript, Next, Mapbox, feature checklist, testing, E2E, **Security / `npm audit` / `overrides`** |
| **[optimization-and-refactoring.md](./optimization-and-refactoring.md)** | Refactor log, `GeometryEngine` split, state note, field perf, related file index |
| **[refactor-roadmap.md](./refactor-roadmap.md)** | Phased plan (A/B/C) — what is done |
| **[changelog.md](./changelog.md)** | Version history; **[Unreleased]** aggregates recent tooling (Vitest, Playwright, CI, deps) |
| **[../src/stores/README.md](../src/stores/README.md)** | `moon-transit-store` (Croatian) — intentional aggregate slice |

**Also:** [AGENTS.md](../AGENTS.md) — short note on this repo’s Next.js 16.
