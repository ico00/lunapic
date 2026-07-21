/**
 * Pans/zooms a Mapbox map to fit all coordinates in a GeoJSON FeatureCollection
 * of LineString / Point / MultiLineString features. No-op when the collection is
 * empty (so deselect/clear doesn't move the camera).
 *
 * Used by the flight-log map layers so selecting a route brings it into view —
 * the layers themselves only render at their real geographic location, which may
 * be outside the current viewport.
 */

import mapboxgl from "mapbox-gl";

interface GeometryLike {
  type?: string;
  coordinates?: unknown;
}

interface FeatureLike {
  geometry?: GeometryLike;
}

interface FeatureCollectionLike {
  features?: FeatureLike[];
}

function extendFromCoords(bounds: mapboxgl.LngLatBounds, coords: unknown): boolean {
  let extended = false;
  if (!Array.isArray(coords)) return false;
  // LineString: [ [lng,lat], ... ]; Point: [lng,lat]
  if (typeof coords[0] === "number") {
    bounds.extend([coords[0] as number, coords[1] as number]);
    return true;
  }
  for (const c of coords) {
    if (extendFromCoords(bounds, c)) extended = true;
  }
  return extended;
}

export function fitGeoJsonBounds(
  map: mapboxgl.Map,
  fc: FeatureCollectionLike,
  opts: { padding?: number; maxZoom?: number; duration?: number } = {}
): void {
  const bounds = new mapboxgl.LngLatBounds();
  let hasCoords = false;
  for (const feat of fc.features ?? []) {
    if (extendFromCoords(bounds, (feat.geometry as GeometryLike | undefined)?.coordinates)) {
      hasCoords = true;
    }
  }
  if (!hasCoords) return;
  map.fitBounds(bounds, {
    padding: opts.padding ?? 64,
    maxZoom: opts.maxZoom ?? 10,
    duration: opts.duration ?? 700,
  });
}
