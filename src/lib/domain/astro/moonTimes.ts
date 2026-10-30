import * as Astronomy from "astronomy-engine";
import type { MoonRiseSetTimes } from "@/types/moon";

/**
 * Izlaz i zlaz Mjeseca za lokalni kalendarski dan koji sadrži `dayContaining`.
 *
 * Isti efemeridni izvor kao `getMoonPosition` (astronomy-engine, topocentrično).
 * SunCalc nema paralaksu Mjeseca pa je izlaz davao i do 16 min ranije nego
 * što ga vidi ostatak aplikacije (mjereno za Zagreb, listopad 2026: p50 6 min).
 *
 * Granice dana su lokalna ponoć → lokalna ponoć (`new Date(y, m, d + 1)` drži
 * i dan od 23 ili 25 h). Zato panel nikad ne prikaže izlaz sutrašnjeg lokalnog
 * dana kao današnji, što je radio stari prozor UTC dana.
 */
export function getMoonRiseSetForLocalDay(
  dayContaining: Date,
  lat: number,
  lng: number,
  observerElevM = 0
): MoonRiseSetTimes {
  const y = dayContaining.getFullYear();
  const m = dayContaining.getMonth();
  const d = dayContaining.getDate();
  const start = new Date(y, m, d);
  const end = new Date(y, m, d + 1);
  const limitDays = (end.getTime() - start.getTime()) / 86_400_000;
  const observer = new Astronomy.Observer(lat, lng, observerElevM);

  const search = (direction: 1 | -1): Date | null => {
    const hit = Astronomy.SearchRiseSet(
      Astronomy.Body.Moon,
      observer,
      direction,
      start,
      limitDays
    );
    return hit == null || hit.date.getTime() >= end.getTime() ? null : hit.date;
  };

  const rise = search(1);
  const set = search(-1);
  if (rise == null && set == null) {
    const eq = Astronomy.Equator(Astronomy.Body.Moon, start, observer, true, true);
    const altitude = Astronomy.Horizon(start, observer, eq.ra, eq.dec, "normal").altitude;
    return { rise: null, set: null, kind: altitude > 0 ? "alwaysUp" : "alwaysDown" };
  }
  return { rise, set, kind: "normal" };
}
