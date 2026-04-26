import { AstroService } from "@/lib/domain/astro/astroService";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import {
  CRUISE_FL_M,
  MOON_AZ_LENGTH_M,
  MOON_PATH_RAY_LENGTH_M,
  OPTIMAL_GROUND_HALF_M,
} from "@/lib/map/mapOverlayConstants";
import { fieldPerfTime } from "@/lib/perf/fieldPerf";
import type { MoonState } from "@/types/moon";
import { useMemo } from "react";

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
  const moonPathPack = useMemo(() => {
    return fieldPerfTime("overlay:moonPathPack", () => {
    const obs = { lat: observerLat, lng: observerLng };
    const samples = AstroService.getMoonPathSamples(
      referenceEpochMs,
      obs.lat,
      obs.lng
    );
    const lineCoords = GeometryEngine.buildMoonPathLineCoordinates(
      obs,
      samples,
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

    const labelHours = [0, 2, 4, 6, 8, 10, 12] as const;
    const labelFeatures = labelHours.map((h) => {
      const t = referenceEpochMs + h * 3_600_000;
      const m = AstroService.getMoonState(new Date(t), obs.lat, obs.lng);
      const [, end] = GeometryEngine.buildMoonAzimuthLine(
        obs,
        m,
        MOON_PATH_RAY_LENGTH_M
      );
      const label = `${new Date(t).getHours().toString().padStart(2, "0")}h`;
      return {
        type: "Feature" as const,
        properties: { label, key: `mph-${h}` },
        geometry: {
          type: "Point" as const,
          coordinates: [end.lng, end.lat],
        },
      };
    });

    return { lineFeature, labelFeatures };
    });
  }, [referenceEpochMs, observerLat, observerLng]);

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
