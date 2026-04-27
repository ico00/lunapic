import {
  centerOfBounds,
  expandBounds,
  getStaticRouteLineFeatures,
  intersectBounds,
  unionBBoxOfAllStaticRoutes,
} from "@/data/staticRouteUtils";
import { geoBoundsAroundPointKm } from "@/lib/domain/geo/boundsAroundPointKm";
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
/** OpenSky bbox oko promatrača (polumjer, promjer 200 km). */
const OPENSKY_OBSERVER_RADIUS_KM = 100;
/** Kad je fallback preko cijelog viewporta, OpenSky je spor — ograniči na ~90 km oko središta tog okvira. */
const FALLBACK_FETCH_CAP_RADIUS_KM = 90;
/** „Širok” viewport (stupnjevi) — iznad toga primjenjuje se cap. */
const FALLBACK_WIDE_LAT_SPAN = 0.85;
const FALLBACK_WIDE_LNG_SPAN = 1.0;
/** Usklađeno s proxy predmemorijom (~30s); smanjuje ponovne pozive istog bbox-a. */
const CACHE_MS = 32_000;

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
    const routesHull = expandBounds(
      unionBBoxOfAllStaticRoutes(),
      ROUTES_MARGIN_DEG,
      ROUTES_MARGIN_DEG
    );
    const obs = q.observer ?? centerOfBounds(q.bounds);
    const aroundObserver = geoBoundsAroundPointKm(
      obs.lat,
      obs.lng,
      OPENSKY_OBSERVER_RADIUS_KM
    );
    const primary = intersectBounds(routesHull, aroundObserver);
    let region: GeoBounds | null;
    if (primary) {
      region = primary;
    } else {
      const fallback = intersectBounds(routesHull, q.bounds);
      if (!fallback) {
        region = null;
      } else {
        const latSpan = fallback.north - fallback.south;
        const lngSpan = fallback.east - fallback.west;
        if (latSpan > FALLBACK_WIDE_LAT_SPAN || lngSpan > FALLBACK_WIDE_LNG_SPAN) {
          const c = centerOfBounds(fallback);
          const cap = geoBoundsAroundPointKm(
            c.lat,
            c.lng,
            FALLBACK_FETCH_CAP_RADIUS_KM
          );
          region = intersectBounds(routesHull, cap) ?? fallback;
        } else {
          region = fallback;
        }
      }
    }
    if (!region) {
      this.lastStats = null;
      return [];
    }

    const tail = async (): Promise<readonly FlightState[]> => {
      const now = Date.now();
      if (
        now < this.fetchNotBeforeMs &&
        this.cache
      ) {
        this.applyStats(this.cache.data, region);
        return flightsFromOpenSkyResponse(this.cache.data, q.bounds);
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
        return flightsFromOpenSkyResponse(this.cache.data, q.bounds);
      }

      const url = `/api/opensky/states?lamin=${region.south}&lomin=${region.west}&lamax=${region.north}&lomax=${region.east}`;
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
      return flightsFromOpenSkyResponse(data, q.bounds);
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
