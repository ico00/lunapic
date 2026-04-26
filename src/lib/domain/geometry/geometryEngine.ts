import {
  aircraftLineOfSightKinematics,
  photographerPack,
} from "./geometryEnginePhotographer";
import {
  buildMoonAzimuthLine,
  buildMoonPathLineCoordinates,
  buildOptimalGroundPathFeatures,
  intersectMoonAzimuthWithStaticRoutes,
} from "./geometryEngineMoonRay";

export type { LatLng, RouteIntersection } from "./geometryEngineTypes";

/**
 * Fasada iznad modula: zrake Mjeseca, presjeci s rutama, kinematika, fotograf.
 * Izvorni kôd: `geometryEngineMoonRay.ts`, `geometryEnginePhotographer.ts`.
 */
export class GeometryEngine {
  static buildMoonAzimuthLine = buildMoonAzimuthLine;
  static buildMoonPathLineCoordinates = buildMoonPathLineCoordinates;
  static intersectMoonAzimuthWithStaticRoutes = intersectMoonAzimuthWithStaticRoutes;
  static buildOptimalGroundPathFeatures = buildOptimalGroundPathFeatures;
  static aircraftLineOfSightKinematics = aircraftLineOfSightKinematics;
  static photographerPack = photographerPack;
}
