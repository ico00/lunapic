import {
  centerOfBounds,
  expandBounds,
  intersectBounds,
  unionBBoxOfAllStaticRoutes,
} from "@/data/staticRouteUtils";
import { geoBoundsAroundPointKm } from "@/lib/domain/geo/boundsAroundPointKm";
import type { FlightQuery } from "@/types/flight";
import type { GeoBounds } from "@/types/geo";

const ROUTES_MARGIN_DEG = 0.25;
const OBSERVER_RADIUS_KM = 100;

/**
 * Ista geometrija upita kao {@link OpenSkyFlightProvider}: presjek koridora
 * `routes.json` s diskom oko promatrača, inače sam disk; filtriranje uključuje
 * viewport ∪ observer disk.
 */
export function openSkyStyleRegionAndFilterBounds(
  q: FlightQuery
): { region: GeoBounds; filterBounds: GeoBounds } {
  const routesHull = expandBounds(
    unionBBoxOfAllStaticRoutes(),
    ROUTES_MARGIN_DEG,
    ROUTES_MARGIN_DEG
  );
  const obs = q.observer ?? centerOfBounds(q.bounds);
  const aroundObserver = geoBoundsAroundPointKm(
    obs.lat,
    obs.lng,
    OBSERVER_RADIUS_KM
  );
  const primary = intersectBounds(routesHull, aroundObserver);
  const region: GeoBounds = primary ?? aroundObserver;
  const filterBounds = unionGeoBounds(q.bounds, aroundObserver);
  return { region, filterBounds };
}

function unionGeoBounds(a: GeoBounds, b: GeoBounds): GeoBounds {
  return {
    south: Math.min(a.south, b.south),
    north: Math.max(a.north, b.north),
    west: Math.min(a.west, b.west),
    east: Math.max(a.east, b.east),
  };
}
