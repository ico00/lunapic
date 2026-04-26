import type { FlightState } from "@/types/flight";

/**
 * OpenSky često isporuči kraći state vektor (bez `extended=1`) ili `category: null`.
 * Da UI ne „gubi” **Aircraft type** / avioprijevoznika nakon svakog refresha, zadržavamo
 * zadnje poznate metapodatke za isti `flight.id` (icao24).
 */
export function mergeStickyFlightMetadata(
  next: readonly FlightState[],
  previous: readonly FlightState[] | undefined
): readonly FlightState[] {
  if (!previous?.length) {
    return next;
  }
  const prevById = new Map(previous.map((f) => [f.id, f]));
  return next.map((f) => {
    const old = prevById.get(f.id);
    if (!old) {
      return f;
    }
    const adsbEmitterCategory =
      f.adsbEmitterCategory != null ? f.adsbEmitterCategory : old.adsbEmitterCategory;
    const aircraftType = f.aircraftType ?? old.aircraftType;
    const airlineName = f.airlineName ?? old.airlineName;
    const originCountry = f.originCountry ?? old.originCountry;
    const airlineIcao = f.airlineIcao ?? old.airlineIcao;
    if (
      adsbEmitterCategory === f.adsbEmitterCategory &&
      aircraftType === f.aircraftType &&
      airlineName === f.airlineName &&
      originCountry === f.originCountry &&
      airlineIcao === f.airlineIcao
    ) {
      return f;
    }
    return {
      ...f,
      adsbEmitterCategory,
      aircraftType,
      airlineName,
      originCountry,
      airlineIcao,
    };
  });
}
