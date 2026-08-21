import type { MoonState } from "@/types";
import { getMoonState } from "./moon";

/**
 * Position-bucketed ephemeris cache for solvers that evaluate the Moon many
 * times at the **same instant** from slightly different ground points — the
 * Newton refinement in `solveMoonShadowSpot` does exactly that, walking a
 * candidate observer a few kilometres and then a few metres.
 *
 * Only the *position* is bucketed, never the time: the Moon's diurnal motion
 * is ~0.25° per minute, so even a one-second time bucket would smear it by a
 * hundredth of its own diameter. Position is cheap to bucket by comparison —
 * moving the observer 2 km shifts the topocentric Moon by ~0.0003°, roughly a
 * thousandth of its diameter.
 *
 * This is deliberately separate from `AstroService`'s cache, which buckets the
 * other way round (10 s of time, 110 m of position, 60 entries) because it
 * serves a UI redrawing one observer over and over.
 */
export type MoonStateAt = (
  atMs: number,
  lat: number,
  lng: number,
  elevM: number
) => MoonState;

const DEFAULT_DEGREE_BUCKET = 0.02;
const DEFAULT_MAX_ENTRIES = 4096;

export function createMoonStateCache(options?: {
  readonly degreeBucket?: number;
  readonly maxEntries?: number;
}): MoonStateAt {
  const degreeBucket = options?.degreeBucket ?? DEFAULT_DEGREE_BUCKET;
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const cache = new Map<string, MoonState>();

  return (atMs, lat, lng, elevM) => {
    const latKey = Math.round(lat / degreeBucket);
    const lngKey = Math.round(lng / degreeBucket);
    const key = `${atMs}|${latKey}|${lngKey}|${Math.round(elevM)}`;
    const hit = cache.get(key);
    if (hit) {
      return hit;
    }
    const value = getMoonState(new Date(atMs), lat, lng, elevM);
    if (cache.size >= maxEntries) {
      cache.delete(cache.keys().next().value!);
    }
    cache.set(key, value);
    return value;
  };
}
