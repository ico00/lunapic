import * as SunCalc from "suncalc";
import type { MoonRiseSetTimes } from "@/types/moon";

type SuncalcMoonTimes = {
  readonly rise?: Date;
  readonly set?: Date;
  readonly alwaysUp?: boolean;
  readonly alwaysDown?: boolean;
};

/**
 * Izlaz Mjeseca i zlaz (suncalc) za lokalizirani kalendaru dan s obzirom na
 * `inUTC` u suncalca — koristimo UTC ponoć radi determinističkog ponašanja
 * (SSR + isti korisnik, isti Y-M-D u UTC).
 */
export function getMoonRiseSetForObserverDay(
  dayContaining: Date,
  lat: number,
  lng: number,
  utcCalendarDay: boolean
): MoonRiseSetTimes {
  const t = new Date(dayContaining);
  if (utcCalendarDay) {
    t.setUTCHours(0, 0, 0, 0);
  } else {
    t.setHours(0, 0, 0, 0);
  }
  const raw = SunCalc.getMoonTimes(t, lat, lng, utcCalendarDay) as SuncalcMoonTimes;
  if (raw.alwaysUp) {
    return { rise: null, set: null, kind: "alwaysUp" };
  }
  if (raw.alwaysDown) {
    return { rise: null, set: null, kind: "alwaysDown" };
  }
  return {
    rise: raw.rise != null ? new Date(raw.rise) : null,
    set: raw.set != null ? new Date(raw.set) : null,
    kind: "normal",
  };
}
