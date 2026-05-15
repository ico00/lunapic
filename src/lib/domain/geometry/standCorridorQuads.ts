import { destinationByAzimuthMeters } from "./wgs84";
import type { GroundObserver } from "@/types";

const norm360 = (d: number) => ((d % 360) + 360) % 360;

export type StandCorridorParams = {
  /** Duž tla: bližnji rub trake (m) od projekcije zrakoplova, duž smjera stajanja. */
  nearAlongM: number;
  /** Dalji rub (m) duž smjera stajanja. */
  farAlongM: number;
  /** Polovina širine trake, okomito na smjer (m). */
  halfWidthM: number;
};

/**
 * Jeden uzorak: tlocrt ispod zrakoplova (lat/lng) + tlocrtni azimut trake
 * (° od sjevera) duž koje traka ide od „noge” udaljeno od promatrača; tipično
 * `norm360(horizontalAcAz3d + 180)` = smjer 3D LoS-azimuta suprotan očištu.
 */
export type StandCorridorSample = {
  groundLat: number;
  groundLng: number;
  standBearingDeg: number;
};

/**
 * Tlocrtna aproksimacija: tlocrtna traka mjesta na tlu. Proširenje 3D LoS: os trake
 * je tlocrtni **back-azimuth** od tlocrtne točke zrakoplova, suprotan horizont. azimutu
 * do zrakoplova s visinom (vidi `horizontalToPoint` + `+ 180°`).
 *
 * Vraća jedan ili više četverokuta (vremenske rezine) — GeoJSON zatvoreni prstenovi
 * (prva točka = zadnja).
 */
export function buildStandCorridorStripFeatures(
  samples: ReadonlyArray<StandCorridorSample>,
  p: StandCorridorParams
): Array<{
  type: "Feature";
  properties: { tIndex: number; kind: "strip"; volumeHeightMeters: 0 };
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
}> {
  const out: Array<{
    type: "Feature";
    properties: { tIndex: number; kind: "strip"; volumeHeightMeters: 0 };
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }> = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const standBearing = norm360(s.standBearingDeg);
    const w = p.halfWidthM;
    const a0 = p.nearAlongM;
    const a1 = p.farAlongM;
    const pL = standBearing - 90;
    const pR = standBearing + 90;

    const cNear = destinationByAzimuthMeters(
      s.groundLat,
      s.groundLng,
      standBearing,
      a0
    );
    const cFar = destinationByAzimuthMeters(
      s.groundLat,
      s.groundLng,
      standBearing,
      a1
    );
    const A = destinationByAzimuthMeters(cNear.lat, cNear.lng, pL, w);
    const B = destinationByAzimuthMeters(cNear.lat, cNear.lng, pR, w);
    const C = destinationByAzimuthMeters(cFar.lat, cFar.lng, pR, w);
    const D = destinationByAzimuthMeters(cFar.lat, cFar.lng, pL, w);

    const ring: [number, number][] = [
      [A.lng, A.lat],
      [B.lng, B.lat],
      [C.lng, C.lat],
      [D.lng, D.lat],
      [A.lng, A.lat],
    ];
    out.push({
      type: "Feature",
      properties: { tIndex: i, kind: "strip", volumeHeightMeters: 0 },
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
    });
  }

  return out;
}

/**
 * 3D-friendly wedge footprint: observer + strip corners so fill-extrusion creates
 * a volume that visually links observer toward the moon/aircraft stand direction.
 */
export function buildStandCorridorObserverVolumeFeature(
  observer: GroundObserver,
  s: StandCorridorSample,
  p: StandCorridorParams,
  volumeHeightMeters: number
): {
  type: "Feature";
  properties: { kind: "volume"; volumeHeightMeters: number };
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
} {
  const standBearing = norm360(s.standBearingDeg);
  const pL = standBearing - 90;
  const pR = standBearing + 90;
  const cNear = destinationByAzimuthMeters(
    s.groundLat,
    s.groundLng,
    standBearing,
    p.nearAlongM
  );
  const cFar = destinationByAzimuthMeters(
    s.groundLat,
    s.groundLng,
    standBearing,
    p.farAlongM
  );
  const A = destinationByAzimuthMeters(cNear.lat, cNear.lng, pL, p.halfWidthM);
  const B = destinationByAzimuthMeters(cNear.lat, cNear.lng, pR, p.halfWidthM);
  const C = destinationByAzimuthMeters(cFar.lat, cFar.lng, pR, p.halfWidthM);
  const D = destinationByAzimuthMeters(cFar.lat, cFar.lng, pL, p.halfWidthM);
  const ring: [number, number][] = [
    [observer.lng, observer.lat],
    [B.lng, B.lat],
    [C.lng, C.lat],
    [D.lng, D.lat],
    [A.lng, A.lat],
    [observer.lng, observer.lat],
  ];
  return {
    type: "Feature",
    properties: {
      kind: "volume",
      volumeHeightMeters: Math.max(0, volumeHeightMeters),
    },
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}

/**
 * Središnja "zero offset" os trake: duž 3D LoS-a na tlo (bližnji → dalji rub
 * udaljenosti kao poligon). Tamo gdje tlocrtno stajanje drži Mjesec i trup u istom
 * horizont. azimutu pri fiksnom očištu.
 */
export function buildStandCorridorSpineLineFeature(
  s: StandCorridorSample,
  p: StandCorridorParams,
  observer: { lat: number; lng: number }
): {
  type: "Feature";
  properties: { kind: "zeroOffsetSpine" };
  geometry: { type: "LineString"; coordinates: [number, number][] };
} {
  const standBearing = norm360(s.standBearingDeg);
  const cFar = destinationByAzimuthMeters(
    s.groundLat,
    s.groundLng,
    standBearing,
    p.farAlongM
  );
  return {
    type: "Feature",
    properties: { kind: "zeroOffsetSpine" },
    geometry: {
      type: "LineString",
      coordinates: [
        [observer.lng, observer.lat],
        [cFar.lng, cFar.lat],
      ],
    },
  };
}

/** 0..360, za smjer tlocrtne trake; vidi `standBearingDeg` u `StandCorridorSample`. */
export function normBearing360(deg: number) {
  return norm360(deg);
}
