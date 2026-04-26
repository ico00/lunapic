import { STATIC_ROUTES, type StaticRouteDefinition } from "@/data/staticRouteUtils";
import { AstroService } from "@/lib/domain/astro/astroService";
import type { GroundObserver } from "@/types";
import type { FlightState } from "@/types/flight";
import type { MoonState } from "@/types";
import {
  angularSizeDegFromObjectLengthMeters,
  lineOfSightKinematics,
  minExposureTimeSecondsForAircraftSize,
  moonAngularDiameterDeg,
  type LineOfSightKinematics,
  signedAzimuthGapDeg,
  timeToAzimuthAlignmentSeconds,
  transitDurationCenterToCenterMs,
} from "./lineOfSightKinematics";
import { horizontalToPoint } from "./horizontal";
import { destinationByAzimuthMeters, toRad, toDeg } from "./wgs84";

const EARTH_MEAN_R = 6_371_000;

export type LatLng = { readonly lat: number; readonly lng: number };

export type RouteIntersection = {
  readonly routeId: string;
  readonly label: string;
  readonly point: LatLng;
};

/**
 * Tangentna ravnina (E, N) u metrima, ishodište = promatrač.
 */
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

/**
 * Paralaksa: GPS nadir nije ista kao točka na tlu ispod *vizualne* kratke strane
 * prema Mjesecu. Model u horizontalnoj ravnini: komponenta sjenke visine h pod
 * elevacijom Mjesca El u smjeru suprotnom od nadir azimuta Mjesca, plus
 * mali ispravak okomito na nadir-vektor povezan s odnosom h i dometa.
 * (Aproksimacija; za rigoroznije treba puni 3D presjek s elipsoidom.)
 */
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
  /** duljina "sjenke" mjerena duž tla, skalirana — jača kad je Mjesec nisko */
  const shadowLen = h / Math.tan(elM);
  const sShadow = Math.min(12_000, shadowLen * 0.04);
  /** u smjeru "od Mjesca" = suprotno od (sin(az), cos(az)) u E–N, os kretanja sjene */
  let e1 = e - Math.sin(azM) * sShadow;
  let n1 = n - Math.cos(azM) * sShadow;
  /** mali pomicaj okomito na nadir, raste s h/d i cos(El) */
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

export class GeometryEngine {
  /**
   * Dva tlocrta za GeoJSON: promatrač → točka u smjeru azimuta Mjesca
   * (AstroService / ephemeris).
   */
  static buildMoonAzimuthLine(
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
   * Svi presjeci mjesinog “zraka” s rutama, nakon paralakse.
   */
  static intersectMoonAzimuthWithStaticRoutes(
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
  static buildOptimalGroundPathFeatures(
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

  /**
   * Kinematika tlocrta (ENU): slant, |d(azimuta očišta)/dt|, °/s i rad/s.
   * Zahtjeva v i track (OpenSky/ADS-B). Statički mock: zadajte npr. 220 m/s, 90°.
   */
  static aircraftLineOfSightKinematics(
    observer: GroundObserver,
    flight: Pick<
      FlightState,
      "position" | "baroAltitudeMeters" | "geoAltitudeMeters" | "groundSpeedMps" | "trackDeg"
    >,
    defaultSpeedMps = 200,
    defaultTrackDeg = 90
  ): LineOfSightKinematics | null {
    const h =
      flight.geoAltitudeMeters ?? flight.baroAltitudeMeters;
    if (h == null) {
      return null;
    }
    const v = flight.groundSpeedMps ?? defaultSpeedMps;
    const tr = flight.trackDeg ?? defaultTrackDeg;
    if (v < 1) {
      return null;
    }
    return lineOfSightKinematics(
      observer,
      flight.position.lat,
      flight.position.lng,
      h,
      v,
      tr
    );
  }

  static photographerPack(
    observer: GroundObserver,
    flight: Pick<
      FlightState,
      | "position"
      | "baroAltitudeMeters"
      | "geoAltitudeMeters"
      | "groundSpeedMps"
      | "trackDeg"
    >,
    moon: MoonState,
    at: Date,
    extra: {
      /** Tipičan Airbus A320; za blur & prosječna kutna veličina. */
      readonly airlinerLengthMeters?: number;
      readonly blurOfAircraftLength?: number;
    } = {}
  ): {
    kin: LineOfSightKinematics;
    acAz: number;
    moAz: number;
    gapDeg: number;
    acAzRateDegS: number;
    moAzRateDegS: number;
    timeToAlignmentSec: number | null;
    transitDurationMs: number | null;
    minExposureSec: number | null;
    shutterText: string | null;
  } | null {
    const kin = GeometryEngine.aircraftLineOfSightKinematics(observer, flight);
    if (!kin) {
      return null;
    }
    const h =
      flight.geoAltitudeMeters ?? flight.baroAltitudeMeters;
    if (h == null) {
      return null;
    }
    const hObs = horizontalToPoint(
      observer,
      flight.position.lat,
      flight.position.lng,
      h
    );
    const m1 = new Date(at.getTime() + 2_000);
    const mNext = AstroService.getMoonState(m1, observer.lat, observer.lng);
    const dMoon =
      ((mNext.azimuthDeg - moon.azimuthDeg + 540) % 360) - 180;
    const moAzRateDegS = dMoon / 2;
    const acAzRateDegS = (kin.azimuthRateRadPerSec * 180) / Math.PI;
    const acAz = hObs.azimuthDeg;
    const moAz = moon.azimuthDeg;
    const gapDeg = signedAzimuthGapDeg(acAz, moAz);
    const timeToAlignmentSec = timeToAzimuthAlignmentSeconds(
      gapDeg,
      acAzRateDegS,
      moAzRateDegS
    );
    const L = extra.airlinerLengthMeters ?? 40;
    const blur = extra.blurOfAircraftLength ?? 0.02;
    const dMoonFull = moonAngularDiameterDeg(moon.apparentRadius.degrees);
    const dAc = angularSizeDegFromObjectLengthMeters(
      L,
      kin.slantRangeMeters
    );
    const transitDurationMs = transitDurationCenterToCenterMs(
      kin.absAzimuthRateDegPerSec,
      dMoonFull,
      dAc
    );
    const minExp = minExposureTimeSecondsForAircraftSize(
      kin.azimuthRateRadPerSec,
      kin.slantRangeMeters,
      L,
      blur
    );
    return {
      kin,
      acAz,
      moAz,
      gapDeg,
      acAzRateDegS,
      moAzRateDegS,
      timeToAlignmentSec,
      transitDurationMs,
      minExposureSec: minExp,
      shutterText:
        minExp != null && minExp > 0
          ? `Suggest: 1/${Math.max(1, Math.round(1 / minExp))} s (blur < ${(blur * 100).toFixed(0)}% of span, L=${L} m)`
          : null,
    };
  }
}
