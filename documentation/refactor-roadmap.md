# Refactor roadmap (architecture)

Plan usklađen s pravilom: orkestracija u hookovima, UI tanak, domena u `lib/domain`.

## Faza A — dovršeno

- **Map overlay orkestracija** — `useMapMoonOverlayFeatures` (GeoJSON iz `AstroService` + `GeometryEngine` + konstante zraka).
- **Letovi na karti** — `useExtrapolatedFlightsForMap` (wall clock ~400 ms + OpenSky skew + `extrapolateFlightForDisplay`); `useMapGeoJsonSync` throttles `flights-geo` `setData`; store koristi `mergeFlightsWithOpenSkyRetention`.
- **Konstante karte** — `lib/map/mapOverlayConstants.ts`, `lib/map/mapSourceIds.ts` (jedan izvor imena izvora).
- **Format / jedinice** — `lib/format/numbers.ts` (`formatFixed`, `mpsToKnots`) umjesto lokalnih funkcija u shellu.
- **GPS** — `useGpsObserver` (geolocation I/O izvan `HomePageClient`).

## Faza B — dovršeno

- **Map init** — `registerMoonTransitLayers(map)` u `lib/map/registerMoonTransitLayers.ts`; `geoBoundsFromMapbox`, `createObserverMarkerElement`.
- **Efekti sinkronizacije** — `useMapGeoJsonSync` (`src/hooks/useMapGeoJsonSync.ts`) za sve `setData` na GeoJSON izvorima.
- `**HomePageClient`** — ploče u `src/components/shell/panels/*` + `GoldenAlignmentFlash`.
- **Map orkestracija** — `useMoonTransitMap` + `MapObserverControlStrip`; tanki `MapContainer`.
- **Shell orkestracija** — `useHomeShellOrchestration` (hookovi + store, bez JSX-a u jednoj datoteci).

## Faza C — dovršeno (stanje / domena / konvencije)

- **Zustand** — odluka dokumentirana u `documentation/architecture.md` (namjerni agregat u `moon-transit-store`); kratki razlog u `src/stores/README.md`; cjelovitiji log u `documentation/optimization-and-refactoring.md`.
- **GeometryEngine** — rascjep na `geometryEngineMoonRay.ts`, `geometryEnginePhotographer.ts`, `geometryEngineTypes.ts`; tanka fasada u `geometryEngine.ts` (API ostaje `GeometryEngine.*`). Vidi `documentation/optimization-and-refactoring.md` §8.
- **Nove značajke** — checklist u `documentation/technicalconventions.md` (domena, provider, hook, panel, karta) da se logika ne gomila u `HomePageClient` / `MapContainer`.

## Prag

- Datoteke > **~200** linija: razmotriti rascjep; `MapContainer` / `HomePageClient` svedeni; veći geometry moduli i dalje kandidat za daljnji rascjep po potrebi.

