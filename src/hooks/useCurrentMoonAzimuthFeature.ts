import { AstroService } from "@/lib/domain/astro/astroService";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import { MOON_AZ_LENGTH_M } from "@/lib/map/mapOverlayConstants";
import type { Feature, LineString, Point } from "geojson";
import { useEffect, useMemo, useState } from "react";

const NOW_MOON_AZ_TICK_MS = 1_000;
const NOW_LABEL_DISTANCE_M = 220_000;

type CurrentMoonAzimuthPack = {
  lineFeature: Feature<LineString>;
  labelFeature: Feature<Point>;
};

export function useCurrentMoonAzimuthFeature(
  observerLat: number,
  observerLng: number
): CurrentMoonAzimuthPack {
  const [nowEpochMs, setNowEpochMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNowEpochMs(Date.now());
    }, NOW_MOON_AZ_TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, []);

  return useMemo(() => {
    const moonNow = AstroService.getMoonState(
      new Date(nowEpochMs),
      observerLat,
      observerLng
    );
    const [a, b] = GeometryEngine.buildMoonAzimuthLine(
      { lat: observerLat, lng: observerLng },
      moonNow,
      MOON_AZ_LENGTH_M
    );
    const nowLabelPoint = destinationByAzimuthMeters(
      observerLat,
      observerLng,
      moonNow.azimuthDeg,
      NOW_LABEL_DISTANCE_M
    );
    const lineFeature: Feature<LineString> = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
      },
      properties: { kind: "moon-azimuth-now" },
    };
    const labelFeature: Feature<Point> = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [nowLabelPoint.lng, nowLabelPoint.lat],
      },
      properties: {
        label: "NOW",
      },
    };
    return { lineFeature, labelFeature };
  }, [nowEpochMs, observerLat, observerLng]);
}
