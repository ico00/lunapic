/**
 * GeoJSON LineString feature for map corridor drawing (static routes, airways).
 */
export type RouteLineFeature = {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  properties: {
    routeId: string;
    label: string;
    altitudeMeters: number;
  };
};
