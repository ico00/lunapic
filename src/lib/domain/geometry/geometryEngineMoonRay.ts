import { STATIC_ROUTES, type StaticRouteDefinition } from "@/data/staticRouteUtils";
import type { MoonState } from "@/types";
import { destinationByAzimuthMeters, toRad, toDeg } from "./wgs84";
import type { LatLng, RouteIntersection } from "./geometryEngineTypes";

const EARTH_MEAN_R = 6_371_000;

function lngLatToEnuMeters(
  observer: LatLng,
  lng: number,
  lat: number
): { e: number; n: number } {
  const dLon = toRad(lng - observer.lng) * Math.cos(toRad(observer.lat));
  const dLat = toRad(lat - observer.lat);
  return { e: dLon * EARTH_MEAN_R, n: dLat * EARTH_MEAN_R };
}

function enuMetersToLngLat(
  observer: LatLng,
  e: number,
  n: number
): LatLng {
  const dLat = n / EARTH_MEAN_R;
  const dLon = e / (EARTH_MEAN_R * Math.cos(toRad(observer.lat)));
  return {
    lat: observer.lat + toDeg(dLat),
    lng: observer.lng + toDeg(dLon),
  };
}

function applyParallaxToEnu(
  e: number,
  n: number,
  flightAltM: number,
  moon: MoonState
): { e: number; n: number } {
  const d = Math.hypot(e, n);
  const azM = toRad(moon.azimuthDeg);
  const elM = toRad(
    Math.max(2, Math.min(88, moon.altitudeDeg))
  );
  const h = Math.max(0, flightAltM);
  const shadowLen = h / Math.tan(elM);
  const sShadow = Math.min(12_000, shadowLen * 0.04);
  let e1 = e - Math.sin(azM) * sShadow;
  let n1 = n - Math.cos(azM) * sShadow;
  if (d > 1) {
    const uE = e / d;
    const uN = n / d;
    const pE = -uN;
    const pN = uE;
    const elFactor = Math.cos(elM);
    const sLateral = (h * elFactor) / (d + 1_000) * 120;
    e1 += pE * sLateral;
    n1 += pN * sLateral;
  }
  return { e: e1, n: n1 };
}

function segmentRayIntersect(
  rDirE: number,
  rDirN: number,
  p0: { e: number; n: number },
  p1: { e: number; n: number }
): { tRay: number; tSeg: number; e: number; n: number } | null {
  const sE = p1.e - p0.e;
  const sN = p1.n - p0.n;
  const det = rDirE * sN - rDirN * sE;
  if (Math.abs(det) < 1e-9) {
    return null;
  }
  const inv = 1 / det;
  const tRay = (p0.e * sN - p0.n * sE) * inv;
  if (tRay < 0) {
    return null;
  }
  const tSeg = (rDirE * p0.n - rDirN * p0.e) * inv;
  if (tSeg < 0 || tSeg > 1) {
    return null;
  }
  return {
    tRay,
    tSeg,
    e: p0.e + tSeg * sE,
    n: p0.n + tSeg * sN,
  };
}

/**
 * Dva tlocrta za GeoJSON: promatrač → točka u smjeru azimuta Mjesca
 * (AstroService / ephemeris).
 */
export function buildMoonAzimuthLine(
  observer: LatLng,
  moon: Pick<MoonState, "azimuthDeg">,
  lengthMeters: number
): [LatLng, LatLng] {
  const a = { lat: observer.lat, lng: observer.lng };
  const b = destinationByAzimuthMeters(
    observer.lat,
    observer.lng,
    moon.azimuthDeg,
    lengthMeters
  );
  return [a, b];
}

/**
 * End points of the moon-azimuth ray at `lengthMeters` for each sample, in
 * chronological order, for a LineString (ground projection of the path).
 */
export function buildMoonPathLineCoordinates(
  observer: LatLng,
  samples: readonly { readonly azimuthDeg: number }[],
  lengthMeters: number
): [number, number][] {
  if (samples.length < 2) {
    return [];
  }
  return samples.map((s) => {
    const p = destinationByAzimuthMeters(
      observer.lat,
      observer.lng,
      s.azimuthDeg,
      lengthMeters
    );
    return [p.lng, p.lat] as [number, number];
  });
}

/**
 * Svi presjeci mjesinog “zraka” s rutama, nakon paralakse.
 */
export function intersectMoonAzimuthWithStaticRoutes(
  observer: LatLng,
  moon: MoonState,
  cruiseAltitudeMeters: number,
  routes: readonly StaticRouteDefinition[] = STATIC_ROUTES.routes
): readonly RouteIntersection[] {
  const az = toRad(moon.azimuthDeg);
  const rE = Math.sin(az);
  const rN = Math.cos(az);
  const out: RouteIntersection[] = [];
  for (const route of routes) {
    const w = route.waypoints;
    for (let i = 0; i < w.length - 1; i++) {
      const [ln0, la0] = w[i]!;
      const [ln1, la1] = w[i + 1]!;
      const g0 = lngLatToEnuMeters(observer, ln0, la0);
      const g1 = lngLatToEnuMeters(observer, ln1, la1);
      const p0 = applyParallaxToEnu(
        g0.e,
        g0.n,
        cruiseAltitudeMeters,
        moon
      );
      const p1 = applyParallaxToEnu(
        g1.e,
        g1.n,
        cruiseAltitudeMeters,
        moon
      );
      const hit = segmentRayIntersect(rE, rN, p0, p1);
      if (hit) {
        const ll = enuMetersToLngLat(observer, hit.e, hit.n);
        out.push({ routeId: route.id, label: route.label, point: ll });
      }
    }
  }
  return out;
}

/**
 * Isprekidana ploha na tlu: u smjeru okomitom na (paralaksa-ispravljenu) rutu
 * u točki presjeka sa „mjesinim” zrakom – lokalno „kandidatska traka” centra
 * tranzita (geometrijska aproksimacija, ne mjerom).
 */
export function buildOptimalGroundPathFeatures(
  observer: LatLng,
  moon: MoonState,
  cruiseAltitudeMeters: number,
  halfWidthMeters: number,
  routes: readonly StaticRouteDefinition[] = STATIC_ROUTES.routes
): readonly { type: "Feature"; properties: { routeId: string }; geometry: { type: "LineString"; coordinates: [number, number][] } }[] {
  const az = toRad(moon.azimuthDeg);
  const rE = Math.sin(az);
  const rN = Math.cos(az);
  const out: { type: "Feature"; properties: { routeId: string }; geometry: { type: "LineString"; coordinates: [number, number][] } }[] = [];
  for (const route of routes) {
    const w = route.waypoints;
    for (let i = 0; i < w.length - 1; i++) {
      const [ln0, la0] = w[i]!;
      const [ln1, la1] = w[i + 1]!;
      const g0 = lngLatToEnuMeters(observer, ln0, la0);
      const g1 = lngLatToEnuMeters(observer, ln1, la1);
      const p0 = applyParallaxToEnu(
        g0.e,
        g0.n,
        cruiseAltitudeMeters,
        moon
      );
      const p1 = applyParallaxToEnu(
        g1.e,
        g1.n,
        cruiseAltitudeMeters,
        moon
      );
      const sE = p1.e - p0.e;
      const sN = p1.n - p0.n;
      const sl = Math.hypot(sE, sN);
      if (sl < 1) {
        continue;
      }
      const hit = segmentRayIntersect(rE, rN, p0, p1);
      if (!hit) {
        continue;
      }
      const uE = sE / sl;
      const uN = sN / sl;
      const pE = -uN;
      const pN = uE;
      const a = enuMetersToLngLat(
        observer,
        hit.e - pE * halfWidthMeters,
        hit.n - pN * halfWidthMeters
      );
      const b = enuMetersToLngLat(
        observer,
        hit.e + pE * halfWidthMeters,
        hit.n + pN * halfWidthMeters
      );
      out.push({
        type: "Feature",
        properties: { routeId: route.id },
        geometry: {
          type: "LineString",
          coordinates: [
            [a.lng, a.lat],
            [b.lng, b.lat],
          ],
        },
      });
      break;
    }
  }
  return out;
}
