# Zustand stores — dizajn

## Dva sučelja

| Store | Odgovornost |
|-------|-------------|
| `useObserverStore` | Fiksni promatrač (lat/lng/visina), zamka lokacije, zahtjev za fokusom karte. |
| `useMoonTransitStore` | Vrijeme (sidro, pomak, `referenceEpochMs`), `mapView`, letovi, pružitelj, odabrani let, OpenSky skew, učitavanje. |

## Zašto je `moon-transit-store` jedan slice

Držimo **vrijeme**, **karta** (`mapView`) i **letovi** u jednom Zustand agregatu namjerno:

- `loadFlightsInBounds` prirodno ovisi o granicama karte trenutne sesije, a i o **simuliranom** trenutku u UI-ju; razdvajanje u više storeova zahtijevalo bi sinkronizacijski sloj.
- Isti store drži i `flightProvider` — jedna točka za prebacivanje izvora.

Ako u budućnosti raste bol (paralelni PR-ovi, teški testovi), moguć je rascjep — vidi `documentation/optimization-and-refactoring.md` i `documentation/architecture.md` (sekcija o agregatu).

**Pravilo:** domena i `IFlightProvider` implementacije **ne** smiju ovisiti o Zustandu; store je samo transport stanja u React.
