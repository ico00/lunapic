import type { GroundObserver } from "@/types/geo";

/**
 * Zadana lokacija promatrača: **Molvanska ulica 1**, Zagreb, Hrvatska.
 * WGS84 (točne koordinate korisnika).
 */
export const DEFAULT_OBSERVER_LOCATION: GroundObserver = {
  lat: 45.829732804429874,
  lng: 16.063579675707125,
  groundHeightMeters: 0,
};

/** `true` kad je promatrač još na zadanoj točki (npr. prije prvog uspješnog GPS-a). */
export function isDefaultObserverLocation(o: GroundObserver): boolean {
  const d = DEFAULT_OBSERVER_LOCATION;
  return (
    o.lat === d.lat &&
    o.lng === d.lng &&
    o.groundHeightMeters === d.groundHeightMeters
  );
}
