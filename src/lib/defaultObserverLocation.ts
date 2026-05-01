import type { GroundObserver } from "@/types/geo";

/**
 * Zadana lokacija promatrača: **balkon** (Zagreb), WGS84 + nadmorska visina tla (~DEM / ručni unos).
 */
export const DEFAULT_OBSERVER_LOCATION: GroundObserver = {
  lat: 45.82968,
  lng: 16.06368,
  groundHeightMeters: 130,
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
