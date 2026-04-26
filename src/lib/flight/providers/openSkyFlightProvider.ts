import {
  expandBounds,
  getStaticRouteLineFeatures,
  intersectBounds,
  unionBBoxOfAllStaticRoutes,
} from "@/data/staticRouteUtils";
import {
  averageVelocityMpsInRegion,
  flightsFromOpenSkyResponse,
  type OpenSkyStatesResponse,
} from "@/lib/flight/opensky/parseOpenSkyStates";
import type { IFlightProvider, RouteCorridorStats } from "@/types";
import type { FlightQuery, FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";
import type { GeoBounds } from "@/types/geo";

const ROUTES_MARGIN_DEG = 0.25;
const CACHE_MS = 12_000;

type CacheEntry = {
  readonly at: number;
  readonly data: OpenSkyStatesResponse;
  readonly queryBox: GeoBounds;
};

/**
 * OpenSky ADS-B: stvarni zrakoplovi u presjeku zaslona i „corridora” iz
 * `routes.json`, plus prosječna horizontna brzina u toj regiji.
 */
export class OpenSkyFlightProvider implements IFlightProvider {
  readonly id: FlightProviderId = "opensky";

  private lastStats: RouteCorridorStats | null = null;
  private cache: CacheEntry | null = null;

  getRouteLineFeatures(bounds: GeoBounds) {
    return getStaticRouteLineFeatures(bounds);
  }

  getRouteCorridorStats(): RouteCorridorStats | null {
    return this.lastStats;
  }

  async getFlightsInBounds(q: FlightQuery): Promise<readonly FlightState[]> {
    const routesHull = expandBounds(
      unionBBoxOfAllStaticRoutes(),
      ROUTES_MARGIN_DEG,
      ROUTES_MARGIN_DEG
    );
    const region = intersectBounds(routesHull, q.bounds);
    if (!region) {
      this.lastStats = null;
      return [];
    }

    const now = Date.now();
    if (
      this.cache &&
      now - this.cache.at < CACHE_MS &&
      boxesCloseEnough(this.cache.queryBox, region)
    ) {
      this.applyStats(this.cache.data, region);
      return flightsFromOpenSkyResponse(this.cache.data, q.bounds);
    }

    const url = `/api/opensky/states?lamin=${region.south}&lomin=${region.west}&lamax=${region.north}&lomax=${region.east}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenSky: ${res.status} ${err.slice(0, 200)}`);
    }
    const data = (await res.json()) as OpenSkyStatesResponse;
    this.cache = { at: now, data, queryBox: region };
    this.applyStats(data, region);
    return flightsFromOpenSkyResponse(data, q.bounds);
  }

  private applyStats(data: OpenSkyStatesResponse, region: GeoBounds) {
    const avg = averageVelocityMpsInRegion(data, region);
    this.lastStats = avg
      ? {
          avgSpeedMps: avg.avgSpeedMps,
          sampleCount: avg.sampleCount,
        }
      : null;
  }
}

/**
 * Isti geometrijski box unutar ~1e-3° smatra se dovoljno dobrim za predmemoriju.
 */
function boxesCloseEnough(a: GeoBounds, b: GeoBounds): boolean {
  return (
    Math.abs(a.south - b.south) < 0.0015 &&
    Math.abs(a.north - b.north) < 0.0015 &&
    Math.abs(a.west - b.west) < 0.0015 &&
    Math.abs(a.east - b.east) < 0.0015
  );
}
