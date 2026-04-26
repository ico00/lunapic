import type { LngLatBounds } from "mapbox-gl";

import type { GeoBounds } from "@/types/geo";

export function geoBoundsFromMapbox(b: LngLatBounds): GeoBounds {
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng };
}
