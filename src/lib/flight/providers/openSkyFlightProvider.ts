import { getStaticRouteLineFeatures } from "@/data/staticRouteUtils";
import { openSkyStyleRegionAndFilterBounds } from "@/lib/flight/openSkyStyleQueryRegion";
import { appPath } from "@/lib/paths/appPath";
import {
  averageVelocityMpsInRegion,
  flightsFromOpenSkyResponse,
  type OpenSkyStatesResponse,
} from "@/lib/flight/opensky/parseOpenSkyStates";
import type { IFlightProvider, RouteCorridorStats } from "@/types";
import type { FlightQuery, FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";
import type { GeoBounds } from "@/types/geo";

/** Usklađeno s proxy predmemorijom (~12s); glatkiji update bez naglih skokova. */
const CACHE_MS = 12_000;

type CacheEntry = {
  readonly at: number;
  readonly data: OpenSkyStatesResponse;
  readonly queryBox: GeoBounds;
};

/**
 * OpenSky ADS-B: bounded query box + client-side filter. Inside the static
 * `routes.json` hull we intersect with the observer disk to keep requests small;
 * outside that hull we query a ~200 km disk around the observer so relocation
 * (e.g. Amsterdam) still returns local traffic even if the map view was last in Croatia.
 */
export class OpenSkyFlightProvider implements IFlightProvider {
  readonly id: FlightProviderId = "opensky";

  private lastStats: RouteCorridorStats | null = null;
  private cache: CacheEntry | null = null;
  /** Sprječava paralelne `fetch` pozive pri brzom panu (prvi još nije upisao cache). */
  private loadChain: Promise<readonly FlightState[]> = Promise.resolve([]);
  /** Nakon 429: ne šalji novi zahtjev do ovog trenutka (ms). */
  private fetchNotBeforeMs = 0;

  getRouteLineFeatures(bounds: GeoBounds) {
    return getStaticRouteLineFeatures(bounds);
  }

  getRouteCorridorStats(): RouteCorridorStats | null {
    return this.lastStats;
  }

  async getFlightsInBounds(q: FlightQuery): Promise<readonly FlightState[]> {
    const { region, filterBounds } = openSkyStyleRegionAndFilterBounds(q);

    const tail = async (): Promise<readonly FlightState[]> => {
      const now = Date.now();
      if (
        now < this.fetchNotBeforeMs &&
        this.cache
      ) {
        this.applyStats(this.cache.data, region);
        return flightsFromOpenSkyResponse(this.cache.data, filterBounds);
      }
      if (now < this.fetchNotBeforeMs) {
        throw new Error(
          "OpenSky: 429 — rate limit. Using cached data is unavailable; wait ~1 min or use static routes."
        );
      }
      if (
        this.cache &&
        now - this.cache.at < CACHE_MS &&
        boxesCloseEnough(this.cache.queryBox, region)
      ) {
        this.applyStats(this.cache.data, region);
        return flightsFromOpenSkyResponse(this.cache.data, filterBounds);
      }

      const url = appPath(
        `/api/opensky/states?lamin=${region.south}&lomin=${region.west}&lamax=${region.north}&lomax=${region.east}`
      );
      const res = await fetch(url);
      if (
        res.ok &&
        res.headers.get("X-MoonTransit-OpenSky-Source") === "timeout-fallback"
      ) {
        console.warn(
          "[OpenSky] Server returned an empty result (proxy timeout or network). OpenSky or Vercel may be slow — try again, or see Vercel function logs for [MoonTransit OpenSky]."
        );
      }
      if (!res.ok) {
        const text = await res.text();
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
          /* ne-JSON tijelo */
        }
        if (res.status === 429) {
          this.fetchNotBeforeMs = Date.now() + 45_000;
        }
        throw new Error(`OpenSky: ${res.status} ${message}`);
      }
      this.fetchNotBeforeMs = 0;
      const data = (await res.json()) as OpenSkyStatesResponse;
      const at = Date.now();
      this.cache = { at, data, queryBox: region };
      this.applyStats(data, region);
      return flightsFromOpenSkyResponse(data, filterBounds);
    };

    const next = this.loadChain.then(tail, tail);
    this.loadChain = next.catch((): readonly FlightState[] => []);
    return next;
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

