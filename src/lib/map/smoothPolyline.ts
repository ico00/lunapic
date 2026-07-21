/**
 * Catmull-Rom spline glađenje polilinije za prikaz traga leta.
 *
 * Trag se logira svakih ~15 s, pa avion koji kruži daje malo točaka → poligon
 * ("nazubljena" linija). Catmull-Rom interpolira glatke segmente koji **prolaze
 * kroz originalne točke** (vjernost se ne gubi), tako da kružni let izgleda kao
 * gladak krug, slično Flightradaru.
 *
 * Koordinate su `[lng, lat]` ili `[lng, lat, alt]`; interpoliraju se sve
 * komponente (uklj. visinu). Na gradskoj skali planarna aproksimacija lng/lat
 * je sasvim dovoljna.
 */

/** Iznad ovoliko točaka trag je već gust — glađenje se preskače (nepotrebno + skupo). */
const MAX_INPUT_POINTS = 1200;
/** Broj interpoliranih točaka po izvornom segmentu. */
const SUBDIVISIONS = 6;

export function smoothPolylineCoords(
  points: readonly number[][],
  subdivisions: number = SUBDIVISIONS
): number[][] {
  const n = points.length;
  if (n < 3 || n > MAX_INPUT_POINTS) {
    return points.map((p) => p.slice());
  }
  const dim = Math.min(points[0]!.length, 3);
  const at = (i: number) => points[Math.max(0, Math.min(n - 1, i))]!;
  const out: number[][] = [];

  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = new Array<number>(dim);
      for (let d = 0; d < dim; d++) {
        const a0 = p0[d] ?? 0;
        const a1 = p1[d] ?? 0;
        const a2 = p2[d] ?? 0;
        const a3 = p3[d] ?? 0;
        c[d] =
          0.5 *
          (2 * a1 +
            (-a0 + a2) * t +
            (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 +
            (-a0 + 3 * a1 - 3 * a2 + a3) * t3);
      }
      out.push(c);
    }
  }
  out.push(at(n - 1).slice(0, dim));
  return out;
}

type GeoJsonLike = {
  type?: string;
  features?: Array<{
    geometry?: { type?: string; coordinates?: unknown };
  } | null>;
};

/**
 * Vraća kopiju FeatureCollection-a s izglađenim `LineString` geometrijama.
 * Ostale geometrije i svojstva ostaju netaknute.
 */
export function smoothTrailGeoJson<T>(data: T): T {
  const fc = data as GeoJsonLike;
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    return data;
  }
  return {
    ...fc,
    features: fc.features.map((f) => {
      if (
        !f ||
        f.geometry?.type !== "LineString" ||
        !Array.isArray(f.geometry.coordinates)
      ) {
        return f;
      }
      return {
        ...f,
        geometry: {
          ...f.geometry,
          coordinates: smoothPolylineCoords(
            f.geometry.coordinates as number[][]
          ),
        },
      };
    }),
  } as T;
}
