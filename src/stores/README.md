# Zustand stores — dizajn

## Dva sučelja


| Store                 | Odgovornost                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useObserverStore`    | Fiksni promatrač (`lat` / `lng` / `groundHeightMeters`), zamka lokacije, `mapFocusNonce`, postavljanje iz centra karte (`placeObserverFromViewNonce`). Visina: GNSS `altitude` kad preglednik pošalje; inače Mapbox DEM (`terrainGroundHeightSyncNonce` + `requestTerrainGroundHeightSync` nakon GPS-a bez visine, te `queryTerrainElevation` u `useMoonTransitMap` pri dragu / centru karte / učitavanju slojeva). |
| `useMoonTransitStore` | Vrijeme (sidro = **Sync** / sada, pomak naprijed do **~24 h**, `referenceEpochMs`; klizač ≠ UTC ponoć–ponoć nego civilni dan od zadnjeg Sync-a), suncalc izlaz/zlaz (`moonRise` / `moonSet` / `kind` za ephemeru i **vidljivi** luk na karti, osvježavanje s `ephemerisRefetchKey` + `useAstronomySync` — uključujući prijelaz **UTC dana** na klizaču), `mapView`, letovi, **`flightProvider` (zadano `opensky`)** + kad je live i **`liveFlightFeeds`** (OpenSky / ADS-B One checkboxi), odabrani let, OpenSky skew, učitavanje. **Kamera:** `cameraFocalLengthMm`, `cameraSensorType`, `cameraPresetId`, `cameraFrameWidthPx`, `cameraFrameHeightPx` (fixed preseti postavljaju senzor + dimenzije; **Other** zadrži ručne `cameraFrame*`). `loadFlightsInBounds` radi **`mergeLiveFlightLists`** kad su oba live izvora, zatim **`mergeStickyFlightMetadata`** + **`mergeFlightsWithOpenSkyRetention`** (kratko zadržavanje ICAO24; čišćenje pri promjeni providera / live feed mask). |


## Zašto je `moon-transit-store` jedan slice

Držimo **vrijeme**, **karta** (`mapView`) i **letovi** u jednom Zustand agregatu namjerno:

- `loadFlightsInBounds` prirodno ovisi o granicama karte trenutne sesije, a i o **simuliranom** trenutku u UI-ju; razdvajanje u više storeova zahtijevalo bi sinkronizacijski sloj.
- **Mjesečev izlaz/zlaz** (suncalc) živi u istom storeu: `useAstronomySync` osvježava `getMoonTimes` na promjenu **promatrača**, nakon `syncTimeToNow`, i kad **klizač** prijeđe u drugi **UTC kalendar dan** (bump `ephemerisRefetchKey`), ne na svaki mali korak klizača unutar istog UTC dana.
- Isti store drži i `flightProvider` + `liveFlightFeeds` — combobox (portal) samo s checkboxima za **OpenSky** i **ADS-B One**; `ensureFlightSourceComboboxMode` migrira stari `static` na live dual. `static` / `mock` ostaju u tipu i testovima.

Ako u budućnosti raste bol (paralelni PR-ovi, teški testovi), moguć je rascjep — vidi `documentation/optimization-and-refactoring.md` i `documentation/architecture.md` (sekcija o agregatu).

**Pravilo:** domena i `IFlightProvider` implementacije **ne** smiju ovisiti o Zustandu; store je samo transport stanja u React.