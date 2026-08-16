import { destinationByAzimuthMeters, toDeg, toRad } from "@/lib/domain/geometry/wgs84";

/**
 * LDZA (Zagreb Airport) runway reference line — pure visual aid for
 * photography planning, not used in any transit-candidate computation.
 * Redesignated 05/23 → 04/22 on 2020-02-27 due to magnetic declination drift;
 * the physical pavement is unchanged.
 *
 * Coordinates are the actual `aeroway=runway` way geometry from OpenStreetMap
 * (© OpenStreetMap contributors, ODbL) — the same source Mapbox's basemap
 * renders the runway polygon from, so this line stays pixel-aligned with the
 * pavement instead of drifting off a manually-sourced pair of threshold
 * points (an earlier straight-line version computed ~50° bearing vs the
 * pavement's actual ~47°, visibly offset from the runway on the map).
 */
export const LDZA_RUNWAY_04_22_LINE: readonly [lat: number, lng: number][] = [
  [45.7518863, 16.0824635],
  [45.7497304, 16.0791258],
  [45.7496571, 16.0790165],
  [45.746958, 16.0749113],
  [45.7386787, 16.0623171],
  [45.7367684, 16.0594156],
  [45.7341051, 16.0553596],
  [45.7322925, 16.0526165],
  [45.7318639, 16.0519638],
] as const;

/**
 * Extension past each threshold — 3 NM, the instrument-approach alignment
 * minimum (aircraft must be established on the runway centerline by this
 * point under IFR; VFR only requires 1.5 NM, so 3 NM is the conservative
 * bound that covers both). Beyond this distance a flight may still be on
 * base/downwind, not yet tracking the runway heading, so a longer line would
 * overstate how far out the reference track is reliable.
 */
const APPROACH_EXTENSION_METERS = 5_556; // 3 NM

/** Great-circle initial bearing from `a` to `b`, degrees from true north. */
function initialBearingDeg(a: readonly [number, number], b: readonly [number, number]): number {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Straight extension tip past each threshold, along the terminal pavement segment's bearing. */
function buildApproachExtensionTips(): {
  rwy22Ext: { lat: number; lng: number };
  rwy04Ext: { lat: number; lng: number };
} {
  const pavement = LDZA_RUNWAY_04_22_LINE;
  const first = pavement[0]!;
  const second = pavement[1]!;
  const last = pavement[pavement.length - 1]!;
  const secondLast = pavement[pavement.length - 2]!;

  const rwy22ExtBearing = initialBearingDeg(second, first);
  const rwy22Ext = destinationByAzimuthMeters(first[0], first[1], rwy22ExtBearing, APPROACH_EXTENSION_METERS);

  const rwy04ExtBearing = initialBearingDeg(secondLast, last);
  const rwy04Ext = destinationByAzimuthMeters(last[0], last[1], rwy04ExtBearing, APPROACH_EXTENSION_METERS);

  return { rwy22Ext, rwy04Ext };
}

const toLngLat = ([lat, lng]: readonly [number, number]): [number, number] => [lng, lat];

/**
 * Two features tagged by `segment` so the actual pavement can be styled
 * differently from the approach/departure extensions:
 *   - "pavement"  — the real `aeroway=runway` strip (amber, matches the
 *                   "current time" marker accent elsewhere on the map)
 *   - "extension" — the two 3 NM final-approach / initial-climb legs past
 *                   each threshold (neutral, dashed); length is
 *                   `APPROACH_EXTENSION_METERS`
 */
export function buildAirportRunwayLineFeature() {
  const pavement = LDZA_RUNWAY_04_22_LINE;
  const first = pavement[0]!;
  const last = pavement[pavement.length - 1]!;
  const { rwy22Ext, rwy04Ext } = buildApproachExtensionTips();

  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { segment: "extension" },
        geometry: {
          type: "MultiLineString" as const,
          coordinates: [
            [toLngLat([rwy22Ext.lat, rwy22Ext.lng]), toLngLat(first)],
            [toLngLat(last), toLngLat([rwy04Ext.lat, rwy04Ext.lng])],
          ],
        },
      },
      {
        type: "Feature" as const,
        properties: { segment: "pavement" },
        geometry: {
          type: "LineString" as const,
          coordinates: pavement.map(toLngLat),
        },
      },
    ],
  };
}

export function buildAirportRunwayLabelFeatures() {
  const [rwy22Lat, rwy22Lng] = LDZA_RUNWAY_04_22_LINE[0]!;
  const [rwy04Lat, rwy04Lng] = LDZA_RUNWAY_04_22_LINE[LDZA_RUNWAY_04_22_LINE.length - 1]!;
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { label: "RWY 22" },
        geometry: { type: "Point" as const, coordinates: [rwy22Lng, rwy22Lat] },
      },
      {
        type: "Feature" as const,
        properties: { label: "RWY 04" },
        geometry: { type: "Point" as const, coordinates: [rwy04Lng, rwy04Lat] },
      },
    ],
  };
}
