import { MAX_LEAD_SEC } from "@/lib/flight/extrapolateFlightPosition";
import type { FlightState } from "@/types/flight";

/**
 * Iznad ove starosti fixa prikazana pozicija više nije procjena nego fikcija.
 *
 * `extrapolateFlightForDisplay` gura avion naprijed najviše `MAX_LEAD_SEC`
 * (40 s) — sve preko toga marker **stoji** na mjestu na kojem avion odavno
 * nije. Mjereno na živom feedu (2026-08-25): pri starosti fixa preko 15 s
 * medijan greške prikazane pozicije je ~8.4 km, a rep ide do 27 km. Iz takve
 * pozicije `photographerPack` i dalje uredno izračuna odbrojavanje i
 * `willTransit` — dobiješ alert i countdown za avion koji je davno prošao.
 *
 * Zato: avion s ovako starim fixom ostaje na karti (bolje ga vidjeti nego da
 * nestane), ali **ne** ulazi u kandidate, aktivne tranzite ni alerte, i alati
 * za odabrani let javljaju `staleFix` umjesto lažnog broja.
 *
 * Praktični izvor takvih redaka: tar1090 drži avion u `aircraft.json` i nakon
 * što mu prestane stizati signal (12.3 % redaka starije od 25 s, 7 % preko
 * 40 s), a OpenSky zna kasniti i više od toga.
 */
export const STALE_FIX_AFTER_SEC = MAX_LEAD_SEC + 5;

/** Starost fixa u ms, uz istu korekciju latencije koju koristi ekstrapolacija. */
export function flightFixAgeMs(
  f: FlightState,
  wallNowMs: number,
  latencySkewMs = 0
): number {
  return wallNowMs + latencySkewMs - f.timestamp;
}

export function isFlightFixStale(
  f: FlightState,
  wallNowMs: number,
  latencySkewMs = 0
): boolean {
  return flightFixAgeMs(f, wallNowMs, latencySkewMs) > STALE_FIX_AFTER_SEC * 1000;
}
