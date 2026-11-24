/**
 * Live trag odabranog aviona: samo TRENUTNI let.
 *
 * `/api/flight-log/track/<icao24>` vraća sve segmente iz zadnja 2 h, podijeljene
 * na rupama > 5 min. Ista letjelica u tom prozoru često ima i prethodni let:
 * RYR7BP (4caf29) je 2026-11-24 na karti imao i dolazak iz Austrije u
 * Budimpeštu, pa rupu od 87 min (spuštanje, okret, penjanje ispod dosega Pija)
 * i tek onda sadašnji let. Izgledalo je kao jedan let s prekidom.
 *
 * Rupa od 5 min nije dovoljna da razdvoji letove: avion zna toliko nestati i
 * usred leta (teren, rub dometa). Okret na tlu uz spuštanje i penjanje izvan
 * dosega traje dulje, pa je granica leta rupa > `FLIGHT_BREAK_MS`.
 */
export const FLIGHT_BREAK_MS = 20 * 60_000;

type TrailFeature = {
  readonly properties?: { readonly fromMs?: unknown; readonly toMs?: unknown } | null;
};
type TrailCollection<F extends TrailFeature> = {
  readonly type: "FeatureCollection";
  readonly features: readonly F[];
};

function msOf(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function currentFlightTrail<F extends TrailFeature>(
  fc: TrailCollection<F>,
  nowMs: number
): TrailCollection<F> {
  const timed = fc.features
    .map((f) => ({
      f,
      fromMs: msOf(f.properties?.fromMs),
      toMs: msOf(f.properties?.toMs),
    }))
    .filter(
      (s): s is { f: F; fromMs: number; toMs: number } =>
        s.fromMs != null && s.toMs != null
    )
    .sort((a, b) => a.fromMs - b.fromMs);

  const last = timed[timed.length - 1];
  // Zadnji segment je davno završio: avion se tek ponovno pojavio i trenutni
  // let još nema dvije logirane točke — sve što postoji je prethodni let.
  if (!last || nowMs - last.toMs > FLIGHT_BREAK_MS) {
    return { ...fc, features: [] };
  }

  let start = timed.length - 1;
  while (start > 0 && timed[start].fromMs - timed[start - 1].toMs <= FLIGHT_BREAK_MS) {
    start--;
  }
  return { ...fc, features: timed.slice(start).map((s) => s.f) };
}
