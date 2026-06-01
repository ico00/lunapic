import {
  AstroService,
  buildMoonPathSamplesInTimeRange,
  MOON_PATH_STEP_MS,
} from "@/lib/domain/astro/astroService";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import { ENABLE_STATIC_ROUTE_MAP_OVERLAY } from "@/data/staticRouteUtils";
import {
  CRUISE_FL_M,
  MOON_AZ_LENGTH_M,
  MOON_PATH_RAY_LENGTH_M,
} from "@/lib/map/mapOverlayConstants";
import { fieldPerfTime } from "@/lib/perf/fieldPerf";
import { getMoonPathLabelInstants } from "@/lib/map/moonPathLabelInstants";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { MoonRiseSetTimes, MoonState } from "@/types/moon";
import { useMemo } from "react";

function formatMoonPathClockLabel(tMs: number): string {
  return new Date(tMs).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export type MoonPathPack = {
  lineFeature: {
    type: "Feature";
    properties: { kind: string };
    geometry: { type: "LineString"; coordinates: number[][] };
  } | null;
  labelFeatures: Array<{
    type: "Feature";
    properties: { label: string; key: string };
    geometry: { type: "Point"; coordinates: number[] };
  }>;
  fullDayLineFeature: {
    type: "Feature";
    properties: { kind: string };
    geometry: { type: "LineString"; coordinates: number[][] };
  } | null;
  currentPointFeature: {
    type: "Feature";
    properties: { kind: string; label: string };
    geometry: { type: "Point"; coordinates: number[] };
  };
};

/**
 * GeoJSON za moon path, azimut, presjeke s rutama i optimal ground — iz domene, za Mapbox.
 */
export function useMapMoonOverlayFeatures(
  observerLat: number,
  observerLng: number,
  referenceEpochMs: number,
  moon: MoonState,
  observerElevM = 0,
  mapHeightPx = 0
) {
  const moonRise = useMoonTransitStore((s) => s.moonRise);
  const moonSet = useMoonTransitStore((s) => s.moonSet);
  const moonRiseSetKind = useMoonTransitStore((s) => s.moonRiseSetKind);
  const mapZoom = useMoonTransitStore((s) => s.mapView.zoom);
  // Snap to 0.5 increments so path only recomputes on meaningful zoom changes
  const zoomSnapped = Math.round(mapZoom * 2) / 2;

  // When we know the map height, compute the ray so the circle occupies 80% of
  // the viewport height (radius = 40%). Mapbox GL uses 512px world tiles.
  const dynamicRayM = useMemo(() => {
    if (mapHeightPx > 0) {
      const metersPerPx =
        (40075016.686 * Math.cos((observerLat * Math.PI) / 180)) /
        (512 * Math.pow(2, zoomSnapped));
      const radiusPx = 0.4 * mapHeightPx;
      return Math.min(Math.max(radiusPx * metersPerPx, 3_000), 2_000_000);
    }
    return Math.min(
      Math.max(MOON_PATH_RAY_LENGTH_M * Math.pow(2, 6 - zoomSnapped), 3_000),
      2_000_000
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapHeightPx, zoomSnapped, observerLat]);

  const moonPathPack = useMemo(() => {
    return fieldPerfTime("overlay:moonPathPack", () => {
    const obs = { lat: observerLat, lng: observerLng };
    const riseSet: MoonRiseSetTimes = {
      rise: moonRise,
      set: moonSet,
      kind: moonRiseSetKind,
    };
    const spec = AstroService.getMoonPathMapSpec(
      referenceEpochMs,
      obs.lat,
      obs.lng,
      riseSet,
      observerElevM,
      5 * 60 * 1000
    );
    const lineCoords = GeometryEngine.buildMoonPathLineCoordinates(
      obs,
      spec.samples,
      dynamicRayM
    );
    const [, currentMoonEnd] = GeometryEngine.buildMoonAzimuthLine(
      obs,
      moon,
      dynamicRayM
    );
    const currentLngLat: [number, number] = [
      currentMoonEnd.lng,
      currentMoonEnd.lat,
    ];
    const lineFeature =
      lineCoords.length >= 2
        ? {
            type: "Feature" as const,
            properties: { kind: "moon-path" },
            geometry: {
              type: "LineString" as const,
              coordinates: lineCoords,
            },
          }
        : null;

    const d = new Date(referenceEpochMs);
    const fullDayStartUtcMs = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      0,
      0,
      0,
      0
    );
    const fullDayEndUtcMs = fullDayStartUtcMs + 24 * 60 * 60 * 1000 - 1;
    const fullDaySamples = buildMoonPathSamplesInTimeRange(
      fullDayStartUtcMs,
      fullDayEndUtcMs,
      5 * 60 * 1000,
      obs.lat,
      obs.lng,
      observerElevM
    );
    const fullDayCoords = GeometryEngine.buildMoonPathLineCoordinates(
      obs,
      fullDaySamples,
      dynamicRayM
    );
    const fullDayLineFeature =
      fullDayCoords.length >= 2
        ? {
            type: "Feature" as const,
            properties: { kind: "moon-path-full-day" },
            geometry: {
              type: "LineString" as const,
              coordinates: fullDayCoords,
            },
          }
        : null;
    const currentPointFeature = {
      type: "Feature" as const,
      properties: { kind: "moon-path-current", label: formatMoonPathClockLabel(referenceEpochMs) },
      geometry: {
        type: "Point" as const,
        coordinates: [...currentLngLat] as [number, number],
      },
    };

    const labelEveryMs = 2 * 3_600_000;
    const labelFeatures: MoonPathPack["labelFeatures"] = [];
    if (spec.labelWindowMs) {
      const { t0, t1 } = spec.labelWindowMs;
      const instants = getMoonPathLabelInstants(t0, t1, labelEveryMs);
      for (const t of instants) {
        const m = AstroService.getMoonState(new Date(t), obs.lat, obs.lng, observerElevM);
        const [, end] = GeometryEngine.buildMoonAzimuthLine(
          obs,
          m,
          dynamicRayM
        );
        const label = formatMoonPathClockLabel(t);
        labelFeatures.push({
          type: "Feature" as const,
          properties: { label, key: `mph-${t}` },
          geometry: {
            type: "Point" as const,
            coordinates: [end.lng, end.lat],
          },
        });
      }
    }

    return { lineFeature, labelFeatures, fullDayLineFeature, currentPointFeature };
    });
  }, [
    referenceEpochMs,
    observerLat,
    observerLng,
    moon,
    moonRise,
    moonSet,
    moonRiseSetKind,
    dynamicRayM,
  ]);

  const moonAzFeature = useMemo(
    () =>
      fieldPerfTime("overlay:moonAz", () => {
      const [a, b] = GeometryEngine.buildMoonAzimuthLine(
        { lat: observerLat, lng: observerLng },
        moon,
        MOON_AZ_LENGTH_M
      );
      return {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [a.lng, a.lat],
            [b.lng, b.lat],
          ],
        },
        properties: { kind: "moon-azimuth" },
      };
    }),
    [observerLat, observerLng, moon]
  );

  const intersectionFeatures = useMemo(
    () =>
      fieldPerfTime("overlay:intersections", () => {
        if (!ENABLE_STATIC_ROUTE_MAP_OVERLAY) {
          return [];
        }
        const hits = GeometryEngine.intersectMoonAzimuthWithStaticRoutes(
          { lat: observerLat, lng: observerLng },
          moon,
          CRUISE_FL_M
        );
        return hits.map((h) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [h.point.lng, h.point.lat],
          },
          properties: {
            routeId: h.routeId,
            label: h.label,
            key: `${h.routeId}-${h.point.lng}-${h.point.lat}`,
          },
        }));
      }),
    [observerLat, observerLng, moon]
  );

  return {
    moonPathPack,
    moonAzFeature,
    intersectionFeatures,
  };
}
