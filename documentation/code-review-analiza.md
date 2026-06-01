# Analiza koda — Senior Developer Review

**Datum:** 2026-05-16  
**Verzija:** bde029e (HEAD)  
**Reviewer:** Senior Developer (Claude)  
**Opseg:** Arhitektura, SOLID principi, sigurnost, mrtvi kod, modularnost, prijedlozi

---

## 1. Sažetak ocjena

| Kategorija              | Ocjena | Bilješka                                               |
|-------------------------|--------|--------------------------------------------------------|
| Arhitektura             | ★★★★☆  | Slojevita, čista — jedan gorostasni komponent umanjuje |
| SOLID principi          | ★★★☆☆  | SRP i ISP imaju vidljive slabosti                     |
| Sigurnost               | ★★★☆☆  | Dva konkretna propusta, treći potencijalni             |
| Čistoća koda            | ★★★★★  | Nema TODO/FIXME, TypeScript strict, ESLint clean       |
| Modularnost             | ★★★★☆  | Izvrsna za domenu; panel-registracija je ručna         |
| Testiranost             | ★★★★☆  | 27 unit testova, E2E Playwright, CI/CD                 |
| Mrtvi/suvišni kod       | ★★★★☆  | Minimalan; mock provider + perf overlay su svjesni izuzeci |

---

## 2. Arhitektura — što radi dobro

Aplikacija prati **clean layering** koji je rijetko viđen u Next.js projektima ove veličine:

```
UI (React komponente)
   ↕
Hooks (orchestracija, Mapbox, derived state)
   ↕
Stores (Zustand — samo state, bez logike)
   ↕
Domain (lib/domain — čiste funkcije, bez Reacta)
   ↕
Providers & APIs (let sources, server routes)
```

Svaki sloj ne "zna" za sloj iznad njega. `lib/domain/geometry/` može se testirati bez browsera. `lib/flight/flightProviders/` ne importa Zustand. Ovo je izuzetno vrijedan arhitekturalni kapital.

**Pohvale:**
- `IFlightProvider` Strategy pattern — dodavanje novog izvora podataka ne dira postojeći kod
- `useHomeShellOrchestration()` kao fasada koja skriva kompleksnost od `HomePageClient`
- Nonce-based triggeri u `observer-store.ts` — idempotentni, ne mutiraju kompleksne objekte
- `CorridorVolumeCustomLayer.ts` WebGL sloj — 3D koridori bez React re-rendera
- Server-side proxy rute ispravno izoliraju kredencijale (nikad ne odlaze na klijent)

---

## 3. SOLID principi — detaljna analiza

### S — Single Responsibility Principle

**Narušeno: `HomePageClient.tsx` (1400 LOC)**

Ovaj komponent u sebi drži:
- Layout logiku (desktop 3-stupac, mobile 2-red)
- Definiciju panela (`RAIL_ITEMS`, `MOBILE_PANEL_TITLES`)
- `renderPanel()` callback sa switch-like logikom za 8 panela
- Animacije "golden alignment" flasha
- Event handlere za GPS, time sync, flight selection
- Responsive detection + sheet/modal stanje

Svaka od ovih odgovornosti opravdava vlastitu datoteku. Komponent je stabilan i funkcionalan ali je jedina točka gdje je "sve u jednom" — pri dodavanju novog panela mijenjaju se **tri mjesta** unutar iste datoteke: `RAIL_ITEMS`, `MOBILE_PANEL_TITLES`, i `renderPanel()`.

**Dobro: Hooks su korektno podijeljeni**

25+ hookova od kojih svaki radi jednu stvar — `useGpsObserver`, `useWeatherSync`, `useTransitFieldSounds`, `useMapFlightPick`. Ovo je primjer SRP u praksi.

**Granično: `moon-transit-store.ts`**

Ovaj store agregira vrijeme, letove, kameru i map view u jednoj datoteci (~450 LOC). Dizajnerska je odluka (vidi `stores/README.md`) ali je na granici. Sve dok je broj odgovornosti statičan, prihvatljivo — ali pri dodavanju npr. session management-a, trebalo bi ga splitati.

---

### O — Open/Closed Principle

**Narušeno: panel registracija**

Dodavanje novog panela zahtijeva modifikaciju `HomePageClient.tsx` na 3 mjesta. Ovaj patern nije open za ekstenziju bez modifikacije core komponenta.

```typescript
// Trenutno — svaki novi panel traži promjenu na 3 mjesta:
const RAIL_ITEMS: readonly RailItem[] = [...]       // 1. Rail definicija
const MOBILE_PANEL_TITLES: Record<DockId, string>   // 2. Mobile naslovi
const renderPanel = useCallback((id) => {           // 3. Render switch
  if (id === 'moonephemeris') return <MoonEphemerisPanel ... />
  ...
})
```

**Dobro: `IFlightProvider` je O/C compliant**

Novi provider se dodaje bez ikakve promjene u `HomePageClient`, `useMoonTransitMap`, ili domain logici. Samo nova klasa + registracija u `flightProviderRegistry.ts`.

---

### L — Liskov Substitution Principle

**Dobro za provajdere:**

`OpenSkyFlightProvider`, `AdsbOneFlightProvider`, `StaticFlightProvider` i `MockFlightProvider` su potpuno zamjenjivi. `useMoonTransitMap` prima `flightProvider: IFlightProvider` i ne zna s kojim radi.

**Granično: opcionalni interfejsi**

```typescript
export interface IFlightProvider {
  getRouteLineFeatures?(bounds: GeoBounds): readonly RouteLineFeature[];
  getRouteCorridorStats?(): RouteCorridorStats | null;
}
```

Opcionalne metode (`?`) znače da svaki pozvač mora provjeravati `if (provider.getRouteLineFeatures)` — to je narušavanje LSP u strogom smislu jer ne možeš uvijek supstituirati. Ovo je prihvatljivo u praksi, ali signalizira da bi trebale biti zasebni interfejsi.

---

### I — Interface Segregation Principle

**Narušeno (blago): `IFlightProvider`**

Interface miješa dvije odgovornosti: dohvat letova (`getFlightsInBounds`) i dohvat geo-podataka (`getRouteLineFeatures`, `getRouteCorridorStats`). Samo `StaticFlightProvider` implementira route feature metode — ostali ne. Bolje rješenje:

```typescript
interface IFlightProvider {
  getFlightsInBounds(query: FlightQuery): Promise<readonly FlightState[]>
}
interface IRouteFeatureProvider {
  getRouteLineFeatures(bounds: GeoBounds): readonly RouteLineFeature[]
  getRouteCorridorStats(): RouteCorridorStats | null
}
// StaticFlightProvider implements IFlightProvider, IRouteFeatureProvider
```

**Dobro: Type datoteke su dobro segmentirane**

`flight.ts`, `geo.ts`, `moon.ts`, `transit.ts`, `map.ts` — svaka tipska datoteka je fokusirana, bez cross-pollinacije.

---

### D — Dependency Inversion Principle

**Dobro: Domain ne ovisi o Reactu**

`lib/domain/*` je čisti TypeScript — nema `useState`, `useEffect`, nema `window`, nema Zustand. Potpuno invertiran: React ovisi o domain funkcijama, ne obrnuto.

**Granično: Hooks direktno importaju Zustand**

```typescript
const flights = useMoonTransitStore(s => s.flights)
```

Hookovi su direktno spregnutu uz konkretni store. Za ovu veličinu projekta to je prihvatljivo, ali znači da hookovi nisu independently testable bez Zustand mock setup-a.

---

## 4. Sigurnost — konkretni propusti

### 🔴 PROPUST 1 — Mapbox token u git-trackanoj datoteci

**Datoteka:** `.env` (tracked)
**Problem:** `NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoiaWNvMDAi...` je vidljiv u git historiji svakome tko ima pristup repozitoriju.

Mapbox public tokeni su namijenjeni klijentima, ali bez URL restriction-a u Mapbox dashboardu, token može koristiti netko drugi na svom projektu i generirati troškove na tvom računu.

**Preporuka:**
1. Premjesti token u `.env.local` (nije tracked)
2. U Mapbox Console → Tokens → dodaj URL restriction na `drusany.com` (i `localhost:3000` za dev)
3. Rotiraj token ako je bio public dulje od potrebnog

---

### 🔴 PROPUST 2 — Nedostaje numerička validacija bbox parametara u `/api/opensky/states`

**Datoteka:** `src/app/api/opensky/states/route.ts:155`

```typescript
// Trenutno — provjerava samo prisutnost, ne numeričke granice:
if (!lamin || !lomin || !lamax || !lomax) {
  return NextResponse.json({ error: "Nedostaju..." }, { status: 400 });
}
// Vrijednosti se šalju direktno upstream bez validacije!
const url = `${OPENSKY_BASE}?lamin=${encodeURIComponent(lamin)}&...`
```

Usporedba s `/api/adsbone/point/route.ts:72` koji **ispravno** validira:
```typescript
if (!Number.isFinite(lat) || !Number.isFinite(lng) || ...)
```

Napadač može poslati `lamin=abc`, `lamin=9999`, ili `lamin=<script>` — ovaj zadnji ne prolazi zbog `encodeURIComponent`, ali ekstremne numeričke vrijednosti idu upstream i mogu uzrokovati neočekivano ponašanje ili potrošiti API kvotu.

**Popravak:**

```typescript
const la1 = Number(lamin), lo1 = Number(lomin);
const la2 = Number(lamax), lo2 = Number(lomax);
if (
  !Number.isFinite(la1) || la1 < -90 || la1 > 90 ||
  !Number.isFinite(lo1) || lo1 < -180 || lo1 > 180 ||
  !Number.isFinite(la2) || la2 < -90 || la2 > 90 ||
  !Number.isFinite(lo2) || lo2 < -180 || lo2 > 180 ||
  la1 >= la2 || lo1 >= lo2
) {
  return NextResponse.json({ error: "Nevaljane bbox koordinate." }, { status: 400 });
}
```

---

### 🟡 POTENCIJALNI PROBLEM 3 — Nema rate limitinga za pozivatelje API ruta

**Datoteke:** Obje API rute

Rute imaju internu bbox cache (12 s) koja štiti upstream, ali ne štite same rute od napada. Netko može slati tisuće zahtjeva s različitim bbox vrijednostima i:
- Puniti Vercel Hobby invocation budget (~100k/month)
- Trošiti OpenSky API kvotu (ako se koriste s auth)
- U teoriji DoS-ati sam server

**Za Vercel Hobby** ovo je nisko-kritičan problem jer nema billing na funkcije. Na Pro planu ili vlastitom serveru trebalo bi dodati rate limiting (npr. Upstash Redis + `@upstash/ratelimit`).

**Za cPanel deploy** s `server.js`: nema automatske zaštite. Razmotriti nginx rate limiting upstream.

---

### ✅ Sigurnosne pohvale

- `OPENSKY_API_USER` i `OPENSKY_API_PASSWORD` su u `.env.local` (nije tracked) — ispravno
- Basic auth header se konstruira samo server-side, nikad ne odlazi klijentu
- `encodeURIComponent` se koristi za sve upstream URL parametre — nema injection rizika
- Nema `eval()`, nema `dangerouslySetInnerHTML` nigdje u kodu
- Nema direktnog SQL, nema baze podataka — vanjski API jedini attack surface

---

## 5. Neiskorišteni i suvišni kod

### Svjesni izuzeci (treba ostaviti)

- **`src/lib/flight/providers/mockFlightProvider.ts`** — koristi se isključivo u testovima. Nije dead code, samo nije u produkciji.
- **`src/components/perf/FieldPerfOverlay.tsx`** — aktivira se samo s `NEXT_PUBLIC_FIELD_PERF=1`. Dev-only alat, opravdano.
- **`eslint-disable` komentari (6 ukupno)** — svi su opravdani: `no-img-element` zbog basePath coupling-a, `react-hooks/exhaustive-deps` zbog mount-gate pattern-a. Svaki ima komentar koji objašnjava zašto.

### Potencijalno za čišćenje

**`src/lib/map/croatiaVfrBorder.ts`** — Ova datoteka sadrži tvrdo-kodirane koordinate granice Hrvatske za VFR mode mask. Koristi se u `registerMoonTransitLayers.ts`. Funkcionalno je ispravna ali je **jedina geo-specifična tvrdokodirana vrijednost** u cijeloj aplikaciji — sve ostalo je dinamično ili konfigurirano. Ako se aplikacija ikad postavi za korisnike izvan HR, ova maska bi bila pogrešna.

**Preporuka:** Dokumentirati u `documentation/` da je VFR maska namjerno HR-specifična, ili ekstrahovati u konfiguracijski objekt.

---

## 6. Modularnost i nadogradivost

### Što je izvrsno nadogradivo

| Komponenta | Mehanizam | Dodati novu stvar = |
|------------|-----------|---------------------|
| Flight Provider | `IFlightProvider` + registry | Nova klasa, 1 registracija |
| Domain logika | Pure functions | Nova datoteka u `lib/domain/` |
| Map slojevi | `registerMoonTransitLayers.ts` | Nova source + layer definicija |
| Tipovi | `src/types/` | Nova datoteka, export iz `index.ts` |
| Unit testovi | Vitest, svaki `*.test.ts` uz datoteku | `describe()` blok |

### Što zahtijeva oprez pri nadogradnji

**Panel registracija** (sva 3 mjesta u HomePageClient):

```
RAIL_ITEMS          → desktop rail ikone + redosljed
MOBILE_PANEL_TITLES → mobile bottom tab naslovi  
renderPanel()       → koji JSX se renderira za koji ID
```

Svaki novi panel treba promjenu na sva 3 mjesta. Ovo ne skalira ako planiraš 3+ novih panela.

**Zustand store granularnost** — `moon-transit-store.ts` aggregira 4 konceptualna područja. Ako dodaš session management, user preferences ili collaborative features, ovaj store bi trebao biti splittan.

**`useHomeShellOrchestration.ts`** — 25+ hookova i `HomePageClient` komuniciraju isključivo kroz Zustand. Dobro dok su sve promjene lokalne. Ako bi trebao server-sent events ili WebSocket updates, trebao bi novi sloj između.

---

## 7. Prijedlozi za poboljšanja

### P1 — Kritično (sigurnost)

**1. Popraviti bbox validaciju u `/api/opensky/states`**

Dodati `Number.isFinite()` + range provjeru za sva 4 parametra (vidi Propust 2 gore). Popravak je ~10 redova.

**2. Mapbox token URL restriction**

Ući u Mapbox Console i ograničiti token na production i localhost domene. Niska cijena, visoka zaštita.

---

### P2 — Preporučeno (arhitektura)

**3. Panel registracija — extract u konfiguracijski objekt**

Umjesto 3 rasute konstante u `HomePageClient.tsx`:

```typescript
// src/components/shell/panelRegistry.ts
export const PANEL_REGISTRY: PanelDefinition[] = [
  {
    id: 'moonephemeris',
    railIcon: <MoonIcon />,
    railLabel: 'Moon',
    mobileTitle: 'Moon Ephemeris',
    render: (props) => <MoonEphemerisPanel {...props} />,
  },
  // ...
]
```

`HomePageClient` tada iterira nad registryjem. Dodavanje panela = jedna nova stavka u `panelRegistry.ts`, bez modifikacije `HomePageClient`. Ovo je mali refaktor (1-2 sata) s visokim benefitom.

**4. Razdvojiti `IFlightProvider` interface**

```typescript
interface IFlightProvider {
  readonly id: FlightProviderId;
  getFlightsInBounds(query: FlightQuery): Promise<readonly FlightState[]>;
  dispose?(): void;
}

interface IRouteAwareFlightProvider extends IFlightProvider {
  getRouteLineFeatures(bounds: GeoBounds): readonly RouteLineFeature[];
  getRouteCorridorStats(): RouteCorridorStats | null;
}
```

Pozivači koji trebaju route features castaju (`provider as IRouteAwareFlightProvider`) ili provjeravaju `instanceof`. Čišće od opcionalne metode na baznom interfejsu.

---

### P3 — Vrijedno razmotriti (dugoročno)

**5. Splitati `HomePageClient.tsx`**

Razdvajanje u (primjerice):
- `HomePageShell.tsx` — layout, responsive, sheet/rail stanje
- `PanelRenderer.tsx` — `renderPanel()` logika
- `GoldenAlignmentFlash.tsx` — (već postoji zasebno, ali flash state je u HomePageClient)

Trenutna 1400-redna datoteka radi, ali bi pri dodavanju 3+ panela postala teška za navigaciju.

**6. `moon-transit-store.ts` — razmotriti split**

Ako planiraš dodati user preferences, history, ili session features:

```
moon-transit-store.ts  → flights + live feed config
time-store.ts          → timeAnchorMs, timeOffsetMs, referenceEpochMs
camera-store.ts        → focalLength, sensorType, preset
map-view-store.ts      → center, zoom, pitch, bearing
```

Za trenutni opseg projekta **nije hitno** — store radi dobro. Ali pri svakom daljnjem proširenju vrijedi se sjetiti ovog prijedloga.

**7. Rate limiting na API rutama (ako ide na Pro plan)**

Instalirati `@upstash/ratelimit` + Upstash Redis:
```typescript
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  prefix: "moontransit",
});
```
Ograničiti na ~30 zahtjeva/60 s po IP. Za Vercel Hobby trenutno nije kritično.

---

## 8. TypeScript quality

| Metrika | Status |
|---------|--------|
| `strict: true` u tsconfig | ✅ |
| Nema `// @ts-ignore` | ✅ |
| Nema `// @ts-nocheck` | ✅ |
| Nema eksplicitnih `: any` | ✅ |
| Sve store akcije tipkane | ✅ |
| `IFlightProvider` readonly arrays | ✅ (`readonly FlightState[]`) |

Ovo je iznimno čist TypeScript. Cijeli codebase je u strict modu bez kompromisa.

---

## 9. Konzistentnost i konvencije

Kod prati konzistentne paterne kroz cijeli projekt:

- Svi hookovi u `src/hooks/use*.ts` — bez iznimki
- Domain logika u `src/lib/domain/` — nema Reacta, testabilna
- Tipovi eksportirani iz `src/types/index.ts` — centralni import
- `console.log` se ne koristi nigdje — samo `console.error` i `console.warn` s kontekstom u API rutama i error pathovima

Jedina sitna nedosljednost: `src/lib/data/staticRouteUtils.ts` i `src/data/staticRouteUtils.ts` — iste datoteke na dvije lokacije? Vrijedi provjeriti.

---

## 10. Zaključak

Ovo je arhitekturalno zdrava aplikacija. Domain sloj je čist, hookovi su singleresponsibility, Store-driven reaktivnost radi dobro, a Strategy pattern za flight providers je primjerovit. Sigurnosni propusti su konkretni ali ne katastrofalni — prioritet P1 je bbox validacija u OpenSky ruti i Mapbox token restrikcija.

Jedine strukturalne slabosti koje bi mogle postati problemi **pri budućem rastu** su:
1. `HomePageClient.tsx` kao God Component za panel management
2. Ručna panel registracija na 3 mjesta
3. `IFlightProvider` koji miješa dvije odgovornosti

Sve ostalo je solid. Projekt je u stanju u kojem se može nastaviti graditi bez straha od tehničkog duga koji bi usporavao razvoj.
