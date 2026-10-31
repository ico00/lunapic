import { getMoonPosition } from "@/lib/domain/astro/moon";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import { solveMoonShadowSpot } from "@/lib/domain/geometry/moonShadowSpot";
import { destinationByAzimuthMeters, initialBearingDeg, toRad } from "@/lib/domain/geometry/wgs84";
import { LDZA_RUNWAY_04_22_LINE } from "@/lib/map/airportRunwayConfig";

/**
 * Planner "gdje stati" za prilaz/odlazak na LDZA — unaprijed, za zadani dan.
 *
 * Isti solver kao za stvarne letove (`solveMoonShadowSpot`), ali umjesto
 * stvarnog aviona koristi **virtualni avion na idealnom profilu**: dolazi
 * osi 04 na 3° ili odlazi s 22 uz fiksni gradijent. Za svaki trenutak
 * rezultat je linija na tlu: bilo koja točka na njoj (do tolerancije elipse)
 * stavlja avion na disk Mjeseca u trenutku kad je *na odgovarajućoj
 * udaljenosti od praga*. Kako se avion giba, tako se i točka pomiče po liniji.
 *
 * Profili su pretpostavka, ne mjerenje: stvarni avion odstupa od 3° (vjetar,
 * ATC), a odlazni gradijent ovisi o tipu i masi. Zato je rezultat plan za
 * lokaciju, ne garancija.
 */

/** Visina aerodroma LDZA iznad razine mora (m). Teren oko staze se ne modelira. */
export const LDZA_ELEVATION_M = 107;
/** Visina prelaska praga (m). */
export const LANDING_THRESHOLD_CROSSING_HEIGHT_M = 15;
/** Kut prilaza (ILS glide path). */
export const LANDING_GLIDE_ANGLE_DEG = 3;
/**
 * Prosječni gradijent penjanja od početka staze 22 (m visine po m puta).
 * Kalibriran na prethodni ručni proračun (≈745 m na 6 km od praga 04), što
 * odgovara tipičnom A320 odlasku.
 */
export const DEPARTURE_CLIMB_GRADIENT = 0.08;
/** Referentni raspon krila — A320 sa sharkletima. */
export const PLAN_DEFAULT_WINGSPAN_M = 35.8;

/** Udaljenosti od praga 04 duž produžene osi na kojima se računa sjena. */
export const PLAN_MIN_DISTANCE_KM = 3;
export const PLAN_MAX_DISTANCE_KM = 15;
export const PLAN_DISTANCE_STEP_KM = 0.5;
/** Udaljenosti koje se na karti ističu točkom i oznakom pokrivenosti. */
export const PLAN_MARKER_DISTANCES_KM = [4, 6, 8, 10, 12] as const;

export type RunwayFlow = "landing04" | "departure22";

export type RunwayShadowPoint = {
  /** Udaljenost aviona od praga 04 duž produžene osi (km). */
  readonly distanceKm: number;
  /** Visina aviona iznad aerodroma (m). */
  readonly heightAboveAirportM: number;
  readonly lat: number;
  readonly lng: number;
  /** Spot → avion, ravna linija (m). */
  readonly slantRangeM: number;
  /** Širina aviona kao postotak promjera Mjeseca. */
  readonly coveragePercent: number;
  readonly crossTrackToleranceM: number;
  readonly alongTrackToleranceM: number;
  readonly isMarker: boolean;
};

export type RunwayShadowLine = {
  readonly flow: RunwayFlow;
  readonly atMs: number;
  readonly moonAltitudeDeg: number;
  readonly moonAzimuthDeg: number;
  /** Točke poredane po udaljenosti aviona od praga, najbliža prva. */
  readonly points: readonly RunwayShadowPoint[];
};

export type RunwayShadowPlanArgs = {
  readonly startMs: number;
  readonly endMs: number;
  readonly stepMs: number;
  readonly flows: readonly RunwayFlow[];
  /** Točke s manjom pokrivenošću od ovoga se ne crtaju (samo donja granica). */
  readonly minCoveragePercent: number;
  readonly wingspanMeters?: number;
};

type RunwayGeometry = {
  readonly threshold04: readonly [lat: number, lng: number];
  /** Smjer od praga 04 prema van, tj. suprotno od smjera slijetanja. */
  readonly outwardBearingDeg: number;
  readonly lengthMeters: number;
};

export function buildRunwayGeometry(): RunwayGeometry {
  const line = LDZA_RUNWAY_04_22_LINE;
  const last = line[line.length - 1]!;
  const secondLast = line[line.length - 2]!;
  let length = 0;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    length += greatCircleDistanceMeters(a[0], a[1], b[0], b[1]);
  }
  // Pravac završnog segmenta pločnika, isti izvor kao `buildApproachExtensionTips`.
  return {
    threshold04: last,
    outwardBearingDeg: initialBearingDeg(secondLast, last),
    lengthMeters: length,
  };
}

const RUNWAY = buildRunwayGeometry();

/** Visina aviona iznad aerodroma na zadanoj udaljenosti od praga 04. */
export function aircraftHeightAboveAirportM(flow: RunwayFlow, distanceFromThresholdM: number): number {
  if (flow === "landing04") {
    return (
      LANDING_THRESHOLD_CROSSING_HEIGHT_M +
      distanceFromThresholdM * Math.tan(toRad(LANDING_GLIDE_ANGLE_DEG))
    );
  }
  return DEPARTURE_CLIMB_GRADIENT * (RUNWAY.lengthMeters + distanceFromThresholdM);
}

/** Vremenski uzorci [start, end] u koracima; uvijek uključuje start. */
export function buildPlanSampleTimes(startMs: number, endMs: number, stepMs: number): number[] {
  if (!(stepMs > 0) || !(endMs >= startMs)) {
    return [];
  }
  const times: number[] = [];
  for (let t = startMs; t <= endMs; t += stepMs) {
    times.push(t);
  }
  return times;
}

function distanceGridKm(): number[] {
  const out: number[] = [];
  const n = Math.round((PLAN_MAX_DISTANCE_KM - PLAN_MIN_DISTANCE_KM) / PLAN_DISTANCE_STEP_KM);
  for (let i = 0; i <= n; i += 1) {
    out.push(PLAN_MIN_DISTANCE_KM + i * PLAN_DISTANCE_STEP_KM);
  }
  return out;
}

const isMarkerDistance = (km: number): boolean =>
  PLAN_MARKER_DISTANCES_KM.some((m) => Math.abs(m - km) < 1e-9);

/**
 * Linije za sve tražene trenutke i tokove. Trenutak u kojem je Mjesec ispod
 * praga vidljivosti (5°) daje prazan skup — kao i ostatak aplikacije.
 */
export function computeRunwayShadowPlan(args: RunwayShadowPlanArgs): RunwayShadowLine[] {
  const { startMs, endMs, stepMs, flows, minCoveragePercent } = args;
  const wingspanMeters = args.wingspanMeters ?? PLAN_DEFAULT_WINGSPAN_M;
  const grid = distanceGridKm();
  const lines: RunwayShadowLine[] = [];

  for (const atMs of buildPlanSampleTimes(startMs, endMs, stepMs)) {
    for (const flow of flows) {
      const points: RunwayShadowPoint[] = [];
      let moonAltitudeDeg = 0;
      let moonAzimuthDeg = 0;

      for (const distanceKm of grid) {
        const distanceM = distanceKm * 1000;
        const height = aircraftHeightAboveAirportM(flow, distanceM);
        const aircraft = destinationByAzimuthMeters(
          RUNWAY.threshold04[0],
          RUNWAY.threshold04[1],
          RUNWAY.outwardBearingDeg,
          distanceM
        );
        const spot = solveMoonShadowSpot({
          aircraftLat: aircraft.lat,
          aircraftLng: aircraft.lng,
          aircraftAltitudeMeters: LDZA_ELEVATION_M + height,
          atMs,
          groundHeightMeters: LDZA_ELEVATION_M,
          wingspanMeters,
        });
        if (!spot) {
          continue;
        }
        moonAltitudeDeg = spot.moonAltitudeDeg;
        moonAzimuthDeg = spot.moonAzimuthDeg;
        if (spot.coveragePercent < minCoveragePercent) {
          continue;
        }
        points.push({
          distanceKm,
          heightAboveAirportM: height,
          lat: spot.lat,
          lng: spot.lng,
          slantRangeM: spot.slantRangeMeters,
          coveragePercent: spot.coveragePercent,
          crossTrackToleranceM: spot.crossTrackToleranceMeters,
          alongTrackToleranceM: spot.alongTrackToleranceMeters,
          isMarker: isMarkerDistance(distanceKm),
        });
      }

      if (points.length > 0) {
        lines.push({ flow, atMs, moonAltitudeDeg, moonAzimuthDeg, points });
      }
    }
  }
  return lines;
}

/** Mjesec u trenutku iznad kojeg planiranje ima smisla (za poruku "Moon below 5°"). */
export function moonAltitudeAtAirportDeg(atMs: number): number {
  const t = RUNWAY.threshold04;
  return getMoonPosition(new Date(atMs), t[0], t[1], LDZA_ELEVATION_M).altitudeDeg;
}
