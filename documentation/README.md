# Documentation

**New here?** If you use the app but don’t work on the code, read **[user-guide.md](./user-guide.md)** first (what the UI does, what the map shows, how the observer and time work).

**Developers:** product overview and `npm` commands — repository root [README](../README.md).


| Document                                                                 | Purpose                                                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **[user-guide.md](./user-guide.md)**                                     | **End-user** walkthrough: workflow, map legend, what is calculated in plain language                       |
| **[architecture.md](./architecture.md)**                                 | System design, data flow, Zustand, providers, map, extension points; **QA** (tests, CI, field perf)        |
| **[performance.md](./performance.md)**                                   | In-browser field perf: labels, `NEXT_PUBLIC_FIELD_PERF` / `localStorage`, DevTools                         |
| **[technicalconventions.md](./technicalconventions.md)**                 | TypeScript, Next, Mapbox, feature checklist, testing, E2E, **Security / `npm audit` / `overrides`**        |
| **[optimization-and-refactoring.md](./optimization-and-refactoring.md)** | Refactor log, `GeometryEngine` split, state note, field perf, related file index                           |
| **[refactor-roadmap.md](./refactor-roadmap.md)**                         | Phased plan (A/B/C) — what is done                                                                         |
| **[changelog.md](./changelog.md)**                                       | Version history; **[Unreleased]** — recent changes                                                         |
| **[../src/stores/README.md](../src/stores/README.md)**                   | `moon-transit-store` (Croatian) — why one Zustand aggregate *(developers only; not a second “user” guide)* |


**Also:** [AGENTS.md](../AGENTS.md) — short note on this repo’s Next.js 16.