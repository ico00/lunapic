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
| `extrap:flights` | Extrapolating stored flights for the map tick (every ~200 ms when perf is on) |
| `react:MapBlock:*` | `Profiler` on the map column (`mount` / `update` commit time) |

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
