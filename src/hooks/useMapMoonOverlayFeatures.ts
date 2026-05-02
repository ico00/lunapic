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
  OPTIMAL_GROUND_HALF_M,
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
  moon: MoonState
) {
  const moonRise = useMoonTransitStore((s) => s.moonRise);
  const moonSet = useMoonTransitStore((s) => s.moonSet);
  const moonRiseSetKind = useMoonTransitStore((s) => s.moonRiseSetKind);

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
      riseSet
    );
    const lineCoords = GeometryEngine.buildMoonPathLineCoordinates(
      obs,
      spec.samples,
      MOON_PATH_RAY_LENGTH_M
    );
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
      MOON_PATH_STEP_MS,
      obs.lat,
      obs.lng
    );
    const fullDayCoords = GeometryEngine.buildMoonPathLineCoordinates(
      obs,
      fullDaySamples,
      MOON_PATH_RAY_LENGTH_M
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
    const [, currentMoonEnd] = GeometryEngine.buildMoonAzimuthLine(
      obs,
      moon,
      MOON_PATH_RAY_LENGTH_M
    );
    const currentPointFeature = {
      type: "Feature" as const,
      properties: { kind: "moon-path-current", label: formatMoonPathClockLabel(referenceEpochMs) },
      geometry: {
        type: "Point" as const,
        coordinates: [currentMoonEnd.lng, currentMoonEnd.lat],
      },
    };

    const labelEveryMs = 2 * 3_600_000;
    const labelFeatures: MoonPathPack["labelFeatures"] = [];
    if (spec.labelWindowMs) {
      const { t0, t1 } = spec.labelWindowMs;
      const instants = getMoonPathLabelInstants(t0, t1, labelEveryMs);
      for (const t of instants) {
        const m = AstroService.getMoonState(new Date(t), obs.lat, obs.lng);
        const [, end] = GeometryEngine.buildMoonAzimuthLine(
          obs,
          m,
          MOON_PATH_RAY_LENGTH_M
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

  const optimalGroundFeatures = useMemo(
    () =>
      fieldPerfTime("overlay:optimalGround", () =>
        GeometryEngine.buildOptimalGroundPathFeatures(
          { lat: observerLat, lng: observerLng },
          moon,
          CRUISE_FL_M,
          OPTIMAL_GROUND_HALF_M
        )
      ),
    [observerLat, observerLng, moon]
  );

  return {
    moonPathPack,
    moonAzFeature,
    intersectionFeatures,
    optimalGroundFeatures,
  };
}
