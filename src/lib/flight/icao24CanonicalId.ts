/**
 * Jedinstveni string za ICAO24 u aplikaciji (spajanje OpenSky + ADS-B izvora).
 * OpenSky često šalje **mala** slova, ADSBExchange **hex** u **velikim** — bez
 * normalizacije isti zrakoplov dobije dva `FlightState.id` i dupli marker na karti.
 */
export function canonicalIcao24Id(raw: string): string {
  return raw.trim().toLowerCase();
}
