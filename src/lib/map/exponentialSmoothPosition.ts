export type LatLngPoint = { readonly lat: number; readonly lng: number };

/**
 * Jedan korak eksponencijalnog glađenja `prev → target`, s vremenskom
 * konstantom `tauMs`. Nakon `tauMs` proteklih ~63% puta je prijeđeno, nakon
 * `3*tauMs` ~95%. `dtMs <= 0` vraća `prev` nepromijenjen (nema unatrag u vremenu).
 */
export function exponentialSmoothStep(
  prev: LatLngPoint,
  target: LatLngPoint,
  dtMs: number,
  tauMs: number
): LatLngPoint {
  if (dtMs <= 0 || tauMs <= 0) return prev;
  const factor = 1 - Math.exp(-dtMs / tauMs);
  return {
    lat: prev.lat + (target.lat - prev.lat) * factor,
    lng: prev.lng + (target.lng - prev.lng) * factor,
  };
}
