import type { GeoBounds } from "@/types/geo";
import type { RouteLineFeature } from "@/types/map-overlays";
import routesJson from "./routes.json";

export type StaticRouteDefinition = {
  readonly id: string;
  readonly label: string;
  readonly altitudeMeters: number;
  /** [lng, lat] po GeoJSON konvenciji */
  readonly waypoints: readonly [number, number][];
};

export type StaticRoutesFile = {
  readonly schemaVersion: number;
  readonly cruiseAltitudeMetersDefault: number;
  readonly routes: readonly StaticRouteDefinition[];
};

export const STATIC_ROUTES = routesJson as unknown as StaticRoutesFile;

/**
 * Rute iz `routes.json` koje sijeku zadani vidljivi okvir — za Mapbox.
 */
export function getStaticRouteLineFeatures(
  view: GeoBounds
): readonly RouteLineFeature[] {
  return STATIC_ROUTES.routes
    .filter((r) => routeBBoxIntersectsBounds(r.waypoints, view))
    .map(
      (r) =>
        ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: r.waypoints as [number, number][],
          },
          properties: {
            routeId: r.id,
            label: r.label,
            altitudeMeters: r.altitudeMeters,
          },
        }) satisfies RouteLineFeature
    );
}

function waypointBbox(waypoints: readonly [number, number][]): GeoBounds {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const [lng, lat] of waypoints) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return { south, west, north, east };
}

export function routeBBoxIntersectsBounds(
  waypoints: readonly [number, number][],
  view: GeoBounds
): boolean {
  const a = waypointBbox(waypoints);
  return !(
    a.east < view.west ||
    a.west > view.east ||
    a.south > view.north ||
    a.north < view.south
  );
}

export function centerOfBounds(b: GeoBounds): { lat: number; lng: number } {
  return {
    lat: (b.south + b.north) / 2,
    lng: (b.west + b.east) / 2,
  };
}

/**
 * Pronalazi točku na ruti (waypoint) najbližu središtu viewporta.
 */
export function bestWaypointOnRoute(
  waypoints: readonly [number, number][],
  viewCenter: { lat: number; lng: number }
): { lat: number; lng: number } {
  let best = { lat: waypoints[0][1], lng: waypoints[0][0] };
  let d2 = Infinity;
  for (const [lng, lat] of waypoints) {
    const dx = lng - viewCenter.lng;
    const dy = lat - viewCenter.lat;
    const s = dx * dx + dy * dy;
    if (s < d2) {
      d2 = s;
      best = { lat, lng };
    }
  }
  return best;
}

/**
 * Ograničavajući pravokutnik svih točaka u `routes.json` (WGS84).
 */
export function unionBBoxOfAllStaticRoutes(): GeoBounds {
  return waypointBbox(
    STATIC_ROUTES.routes.flatMap((r) => r.waypoints) as [number, number][]
  );
}

export function expandBounds(
  b: GeoBounds,
  marginLat: number,
  marginLng: number
): GeoBounds {
  return {
    south: b.south - marginLat,
    north: b.north + marginLat,
    west: b.west - marginLng,
    east: b.east + marginLng,
  };
}

/**
 * Unija dvaju okvira (mora uključivati ista hemisfera / bez datumske crte u okviru).
 */
export function intersectBounds(
  a: GeoBounds,
  b: GeoBounds
): GeoBounds | null {
  const south = Math.max(a.south, b.south);
  const north = Math.min(a.north, b.north);
  const west = Math.max(a.west, b.west);
  const east = Math.min(a.east, b.east);
  if (south > north - 1e-9 || west > east - 1e-9) {
    return null;
  }
  return { south, north, west, east };
}
