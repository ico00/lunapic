# Performance — real-world profiling

This project measures **in-browser** work for the map stack (not only file layout). Use this together with **Chrome DevTools → Performance** when you need full flame charts.

## Field performance mode (in-app)

When enabled, a **violet panel** (top-right on the map) shows rolling last / average times for:

| Label | What it measures |
| ----- | ----------------- |
| `map:moveendToIdle` | Mapbox: time from `moveend` until the next `idle` (rendering + repainting the map) |
| `map:boundsRefresh` | Synchronous work in the map move callback (load bounds, set route source) |
| `overlay:*` | `useMapMoonOverlayFeatures` `useMemo` blocks (moon path, azimuth, intersections, optimal ground) |
| `geojson:*` | `setData` passes in `useMapGeoJsonSync` |
| `extrap:flights` | Extrapolating stored flights for the map tick (rAF-based, throttled to **≤ 80 ms** ≈ 12 fps via `MIN_TICK_MS` in `useExtrapolatedFlightsForMap`; flight GeoJSON `setData` is also **throttled at 80 ms** in `useMapGeoJsonSync`) |
| `react:MapBlock:*` | `Profiler` on the map column (`mount` / `update` commit time) |

> **Note — `AstroService.getMoonState` cache (2026-05-26):** Moon position is cached in 10-second buckets (LRU, max 60 entries). Any call within the same 10 s window for the same observer returns instantly without running VSOP87. This is what makes the 100 ms `usePhotographerTools` tick cheap (≈ 0.2 ms per tick instead of ≈ 10 ms). The cache key is `epochBucket|lat3dp|lng3dp|elevRound`. The bucket rounding matters for the forward-step rate computation in `photographerPack` — see `geometryEnginePhotographer.ts` for details.

> **Note — shared transit computation dedup (2026-07-22):** Before this date, `useMoonStateComputed` / `useTransitCandidates` / `useActiveTransits` each ran their own `useWallNowMs` tick + recomputation independently in every consuming component (`MapContainer`, `FieldOverlaysSection`, `CompassAimPanel`, `useHomeShellOrchestration`, `ArSkyCameraPanel`) — 4-6 duplicate copies of the same moon/candidate/active-transit computation running continuously at 250 ms, on top of the map's own WebGL re-render load. This was heavy enough to spin desktop fans. Now `useSharedTransitComputation` (`src/hooks/useSharedTransitComputation.ts`) is the **only** place doing the tick + computation; results land in `useTransitComputedStore` (`src/stores/transit-computed-store.ts`) and every consumer reads via a cheap selector. If you're profiling and still see redundant `getMoonState` / `computeTransitCandidates` calls per tick, check whether a new call site reintroduced its own `useWallNowMs` instead of reading the shared store — see `documentation/architecture.md` → "Shared transit computation (dedup)".

**Enable without rebuild (good for a quick field check):**

1. Open DevTools → **Console** (map page loaded).
2. Run: `localStorage.setItem('moonTransitFieldPerf', '1'); location.reload();`

**Or** set in **`.env.local`:**

```env
NEXT_PUBLIC_FIELD_PERF=1
```

**Disable:** remove the env var and run `localStorage.removeItem('moonTransitFieldPerf')`, then reload.

When the flag is off, the instrumentation is a no-op (negligible overhead in production).

## Chrome / Edge Performance tab

1. **Record** while panning and zooming the map for ~10 s.  
2. Look for long **Tasks** in the main thread and for **Mapbox** / **mapboxgl** in the call stack.  
3. For React commit waste, the in-app `react:MapBlock:update` row complements **React DevTools → Profiler** (separate install).

## Next.js and production

`NEXT_PUBLIC_FIELD_PERF=1` is for **dev / staging** or short field sessions. It **must not** be used for public “perf numbers” in marketing copy: numbers depend on device, GPU, and data volume.

## Playwright (automated)

For CI-style CPU samples of the app shell, the Cursor/Playwright integration can start a **CPU profile**; use that for **regressions in automation**, not for absolute FPS on a photographer’s device.
