import { centerOfBounds } from "@/data/staticRouteUtils";
import { geoBoundsAroundPointKm } from "@/lib/domain/geo/boundsAroundPointKm";
import type { FlightQuery } from "@/types/flight";
import type { GeoBounds } from "@/types/geo";

/**
 * Disk koji `openSkyStyleRegionAndFilterBounds` traži od web izvora — vidi
 * AGENTS.md („Krug na mapi”). Web upit namjerno ostaje na 100 km: širi bbox
 * troši kredite, a dalje avione ionako donosi vlastiti prijemnik.
 */
export const FLIGHT_OBSERVER_RADIUS_KM = 100;

/**
 * Do kuda se avion zadržava i razmatra kao budući tranzit: 100 km (granica
 * samog tranzita, `MAX_TRANSIT_SLANT_METERS`) + 300 s pri 270 m/s
 * (`MAX_ALIGNMENT_LOOKAHEAD_SEC`, brži krstareći s leđnim vjetrom) ≈ 181 km.
 * Avion s tog ruba stigne do tranzita na 100 km unutar horizonta predviđanja.
 * Ovo nije granica fotografiranja — ona ostaje 100 km u trenutku tranzita.
 */
export const TRANSIT_SCREENING_RADIUS_KM = 185;

export function unionGeoBounds(a: GeoBounds, b: GeoBounds): GeoBounds {
  return {
    south: Math.min(a.south, b.south),
    north: Math.max(a.north, b.north),
    west: Math.min(a.west, b.west),
    east: Math.max(a.east, b.east),
  };
}

/**
 * Granice unutar kojih izvor smije zadržati avion: **viewport ∪ disk oko
 * promatrača**.
 *
 * Zašto ne samo viewport: web izvori (`openSkyStyleRegionAndFilterBounds`) su
 * oduvijek filtrirali po ovoj uniji, a lokalni prijemnici su dobivali goli
 * `q.bounds`. Posljedica je bila da zumiranje karte (ono što se radi dok se
 * cilja) izbaci avione iz **vlastitih** prijemnika — let bi pao na 30-sekundni
 * web tempo ili nestao s karte i iz kandidata, iako ga Pi/Avionix u tom
 * trenutku uredno vide. Kandidati, alerti i odbrojavanje ne smiju ovisiti o
 * tome koliko je karta zumirana.
 */
export function flightFilterBounds(q: FlightQuery): GeoBounds {
  const obs = q.observer ?? centerOfBounds(q.bounds);
  return unionGeoBounds(
    q.bounds,
    geoBoundsAroundPointKm(obs.lat, obs.lng, TRANSIT_SCREENING_RADIUS_KM)
  );
}
