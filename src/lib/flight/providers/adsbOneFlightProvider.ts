import { centerOfBounds, getStaticRouteLineFeatures } from "@/data/staticRouteUtils";
import { appPath } from "@/lib/paths/appPath";
import {
  averageVelocityFromFlightsInRegion,
  flightsFromAdsbOnePointResponse,
  radiusNmCoveringBounds,
  type AdsbOnePointResponse,
} from "@/lib/flight/adsbone/parseAdsbOnePoint";
import { openSkyStyleRegionAndFilterBounds } from "@/lib/flight/openSkyStyleQueryRegion";
import type { IFlightProvider, RouteCorridorStats } from "@/types";
import type { FlightQuery, FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";
import type { GeoBounds } from "@/types/geo";

/** Izvor je ograničen na ~1 req/s; predmemorija i debounce na karti smanjuju pritisak. */
const CACHE_MS = 34_000;

type CacheEntry = {
  readonly at: number;
  readonly data: AdsbOnePointResponse;
  readonly queryCenterLat: number;
  readonly queryCenterLng: number;
  readonly queryRadiusNm: number;
};

/**
 * ADS-B One (api.adsb.one) — besplatni REST, oblik ADSBExchange v2.
 * Dohvat po točki + radijus (nm); ista geometrija upita kao OpenSky.
 *
 * @see https://github.com/adsb-one/api
 */
export class AdsbOneFlightProvider implements IFlightProvider {
  readonly id: FlightProviderId = "adsbone";

  private lastStats: RouteCorridorStats | null = null;
  private cache: CacheEntry | null = null;
  private loadChain: Promise<readonly FlightState[]> = Promise.resolve([]);
  private fetchNotBeforeMs = 0;

  getRouteLineFeatures(bounds: GeoBounds) {
    return getStaticRouteLineFeatures(bounds);
  }

  getRouteCorridorStats(): RouteCorridorStats | null {
    return this.lastStats;
  }

  async getFlightsInBounds(q: FlightQuery): Promise<readonly FlightState[]> {
    const { region, filterBounds } = openSkyStyleRegionAndFilterBounds(q);
    const c = centerOfBounds(region);
    const radiusNm = radiusNmCoveringBounds(region);

    const tail = async (): Promise<readonly FlightState[]> => {
      const now = Date.now();
      if (now < this.fetchNotBeforeMs && this.cache) {
        const flights = flightsFromAdsbOnePointResponse(
          this.cache.data,
          filterBounds
        );
        this.applyStats(flights, region);
        return flights;
      }
      if (now < this.fetchNotBeforeMs) {
        throw new Error(
          "ADS-B One: rate limited. Wait a few seconds or switch provider."
        );
      }
      if (
        this.cache &&
        now - this.cache.at < CACHE_MS &&
        queryCloseEnough(
          this.cache.queryCenterLat,
          this.cache.queryCenterLng,
          this.cache.queryRadiusNm,
          c.lat,
          c.lng,
          radiusNm
        )
      ) {
        const flights = flightsFromAdsbOnePointResponse(
          this.cache.data,
          filterBounds
        );
        this.applyStats(flights, region);
        return flights;
      }

      const url = appPath(
        `/api/adsbone/point?lat=${encodeURIComponent(c.lat)}&lng=${encodeURIComponent(c.lng)}&radiusNm=${encodeURIComponent(radiusNm)}`
      );
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) {
        let message = text.slice(0, 240);
        try {
          const j = JSON.parse(text) as {
            error?: string;
            body?: string;
            hint?: string;
          };
          const parts: string[] = [];
          for (const x of [j.error, j.body, j.hint]) {
            if (typeof x === "string" && x.length > 0 && !parts.includes(x)) {
              parts.push(x);
            }
          }
          if (parts.length > 0) {
            message = parts.join(" — ");
          }
        } catch {
          /* non-JSON */
        }
        if (res.status === 429) {
          this.fetchNotBeforeMs = Date.now() + 5_000;
        }
        throw new Error(`ADS-B One: ${res.status} ${message}`);
      }
      this.fetchNotBeforeMs = 0;
      const data = JSON.parse(text) as AdsbOnePointResponse;
      this.cache = {
        at: Date.now(),
        data,
        queryCenterLat: c.lat,
        queryCenterLng: c.lng,
        queryRadiusNm: radiusNm,
      };
      const flights = flightsFromAdsbOnePointResponse(data, filterBounds);
      this.applyStats(flights, region);
      return flights;
    };

    const next = this.loadChain.then(tail, tail);
    this.loadChain = next.catch((): readonly FlightState[] => []);
    return next;
  }

  private applyStats(flights: readonly FlightState[], region: GeoBounds) {
    const avg = averageVelocityFromFlightsInRegion(flights, region);
    this.lastStats = avg
      ? {
          avgSpeedMps: avg.avgSpeedMps,
          sampleCount: avg.sampleCount,
        }
      : null;
  }
}

function queryCloseEnough(
  lat0: number,
  lng0: number,
  r0: number,
  lat1: number,
  lng1: number,
  r1: number
): boolean {
  return (
    Math.abs(lat0 - lat1) < 0.002 &&
    Math.abs(lng0 - lng1) < 0.002 &&
    Math.abs(r0 - r1) < 1.5
  );
}
