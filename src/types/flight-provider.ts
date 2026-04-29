import type { GeoBounds } from "./geo";
import type { FlightQuery, FlightState } from "./flight";
import type { RouteLineFeature } from "./map-overlays";

/** Redoslijed u UI: OpenSky prvi (zadani izvor pri učitavanju). */
export const FLIGHT_PROVIDER_IDS = ["opensky", "static", "mock"] as const;
export type FlightProviderId = (typeof FLIGHT_PROVIDER_IDS)[number];

/**
 * Strategy interface for external flight data (OpenSky, custom feeds, mock).
 * Implementations are swapped without changing domain logic.
 */
export interface IFlightProvider {
  /** Stable id, e.g. "mock" | "opensky". */
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
