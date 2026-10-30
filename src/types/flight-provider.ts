import type { GeoBounds } from "./geo";
import type { FlightQuery, FlightState } from "./flight";
import type { RouteLineFeature } from "./map-overlays";

/** Redoslijed u UI: OpenSky prvi (zadani izvor pri učitavanju). */
export const FLIGHT_PROVIDER_IDS = ["opensky", "adsbone", "localsdr", "avionix", "static", "mock"] as const;
export type FlightProviderId = (typeof FLIGHT_PROVIDER_IDS)[number];

/** Izbornik **Flight source** — samo live izvori (`static` / `mock` ostaju u tipu i registryju za testove i domenu). */
export const FLIGHT_PROVIDER_COMBO_IDS = ["opensky", "adsbone", "localsdr", "avionix"] as const;

/**
 * Avionix Nano trenutno nije spojen (2026-10-30): izvor ostaje na popisu, ali je
 * zasivljen, nikad uključen i ne može se kliknuti (store ga drži na `false`).
 * Vrati na `true` kad se uređaj ponovno spoji — jedino mjesto koje to mijenja.
 */
export const AVIONIX_FEED_AVAILABLE = false;

/**
 * Strategy interface for external flight data (OpenSky, custom feeds, mock).
 * Implementations are swapped without changing domain logic.
 */
export interface IFlightProvider {
  /** Stable id, e.g. "mock" | "opensky" | "adsbone". */
  readonly id: string;
  getFlightsInBounds(query: FlightQuery): Promise<readonly FlightState[]>;
  /**
   * When implemented, the map may draw these polylines (e.g. static corridors
   * over the viewport) without the container depending on a concrete class.
   */
  getRouteLineFeatures?(bounds: GeoBounds): readonly RouteLineFeature[];
  /** npr. OpenSky: zadnji prosjek u presjeku regije ruta i upita. */
  getRouteCorridorStats?(): RouteCorridorStats | null;
  /** Optional: release network handles or workers. */
  dispose?(): void;
}

export type RouteCorridorStats = {
  readonly avgSpeedMps: number;
  readonly sampleCount: number;
};
