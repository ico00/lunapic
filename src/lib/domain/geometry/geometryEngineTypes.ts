export type LatLng = { readonly lat: number; readonly lng: number };

export type RouteIntersection = {
  readonly routeId: string;
  readonly label: string;
  readonly point: LatLng;
};
