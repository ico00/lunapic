import type { GeoBounds, LatLng } from "./geo";

/**
 * Uniquely identifies an aircraft in the provider's namespace.
 */
export type FlightId = string;

/**
 * A snapshot of one aircraft reported by a flight data source.
 */
export interface FlightState {
  readonly id: FlightId;
  readonly icao24?: string;
  readonly callSign?: string | null;
  readonly position: LatLng;
  /**
   * Barometric altitude, meters, or null if unknown.
   * (ADS-B: pressure altitude; treat consistently per provider.)
   */
  readonly baroAltitudeMeters: number | null;
  /**
   * Geometric height above WGS84 ellipsoid when available (e.g. GNSS).
   * Null if the source does not expose it.
   */
  readonly geoAltitudeMeters: number | null;
  /** Ground speed, meters per second. */
  readonly groundSpeedMps: number | null;
  /** Track over ground, degrees [0, 360). */
  readonly trackDeg: number | null;
  /** Unix epoch ms when this state was valid. */
  readonly timestamp: number;
  /**
   * OpenSky `origin_country` — zemlja registracije / operatora u izvoru
   * (nisu uvijek ime avioprijevoznika).
   */
  readonly originCountry?: string | null;
  /** Prva tri znaka callsigna (ICAO airline designator), ako su slova. */
  readonly airlineIcao?: string | null;
  /** ADS-B emitter category iz OpenSky state vektora (npr. indeks 17), ako postoji. */
  readonly adsbEmitterCategory?: number | null;
  /** Tip zrakoplova kad ga izvor navodi (npr. statična ruta, budući metadata). */
  readonly aircraftType?: string | null;
  /** Ime avioprijevoznika kad ga izvor navodi. */
  readonly airlineName?: string | null;
}

export interface FlightQuery {
  readonly bounds: GeoBounds;
  /** Optional: filter or rank by near this point. */
  readonly near?: LatLng;
  readonly minAltitudeMeters?: number;
  readonly maxAltitudeMeters?: number;
}
