import type { Map } from "mapbox-gl";
import { MAPBOX_TERRAIN_DEM_SOURCE } from "@/lib/map/mapSourceIds";

/**
 * Mapbox raster DEM + terrain mesh so `queryTerrainElevation` works.
 * Values are terrain-model meters (not strict WGS84 ellipsoid); see `GroundObserver.groundHeightMeters`.
 */
export function ensureMapboxTerrain(map: Map): void {
  if (map.getSource(MAPBOX_TERRAIN_DEM_SOURCE)) {
    return;
  }
  map.addSource(MAPBOX_TERRAIN_DEM_SOURCE, {
    type: "raster-dem",
    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
    tileSize: 512,
    maxzoom: 14,
  });
  map.setTerrain({ source: MAPBOX_TERRAIN_DEM_SOURCE, exaggeration: 1 });
}

/**
 * @returns meters above the terrain model at `lng`/`lat`, or `null` if tiles / terrain are not ready.
 */
export function queryTerrainElevationMeters(
  map: Map,
  lng: number,
  lat: number
): number | null {
  try {
    const v = map.queryTerrainElevation([lng, lat], { exaggerated: false });
    if (v == null || Number.isNaN(v)) {
      return null;
    }
    return v;
  } catch {
    return null;
  }
}
