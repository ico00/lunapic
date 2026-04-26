import {
  bestWaypointOnRoute,
  centerOfBounds,
  getStaticRouteLineFeatures,
  routeBBoxIntersectsBounds,
  STATIC_ROUTES,
} from "@/data/staticRouteUtils";
import type { IFlightProvider } from "@/types";
import type { FlightQuery, FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";
import type { GeoBounds } from "@/types/geo";

/**
 * Izvor: `src/data/routes.json` — fiksne rute s tipičnom FL kružnom visinom 10,000m.
 * Linije u {@link IFlightProvider.getRouteLineFeatures} slijede ista ograničenja
 * (Strategy — mapa ovisi samo o sučelju).
 */
export class StaticFlightProvider implements IFlightProvider {
  readonly id: FlightProviderId = "static";

  getRouteLineFeatures(bounds: GeoBounds) {
    return getStaticRouteLineFeatures(bounds);
  }

  async getFlightsInBounds(
    q: FlightQuery
  ): Promise<readonly FlightState[]> {
    const t = Date.now();
    const c = centerOfBounds(q.bounds);
    const out: FlightState[] = [];
    for (const r of STATIC_ROUTES.routes) {
      if (!routeBBoxIntersectsBounds(r.waypoints, q.bounds)) {
        continue;
      }
      const p = bestWaypointOnRoute(r.waypoints, c);
      out.push({
        id: `static-${r.id}`,
        callSign: r.label,
        position: p,
        baroAltitudeMeters: r.altitudeMeters,
        geoAltitudeMeters: r.altitudeMeters,
        groundSpeedMps: 220,
        trackDeg: 90,
        timestamp: t,
      });
    }
    return out;
  }
}
