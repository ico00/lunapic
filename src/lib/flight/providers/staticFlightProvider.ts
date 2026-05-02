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
 * {@link IFlightProvider.getRouteLineFeatures} koristi {@link getStaticRouteLineFeatures}
 * (trenutno prazan overlay dok nema historic track polilinija).
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
        airlineName: r.airline ?? null,
        aircraftType: r.aircraftType ?? null,
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
