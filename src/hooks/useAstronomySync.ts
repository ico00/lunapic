import { AstroService } from "@/lib/domain/astro/astroService";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useEffect, useMemo } from "react";

/**
 * Račun izlaz/zlaz Mjeseca za lokalni dan trenutnog `referenceEpochMs` u
 * storeu, te zapis u store. Ponovi dohvat kad se poveća `ephemerisRefetchKey`
 * (**Sync**, prijelaz na drugi lokalni dan, promjena promatrača) — ne na
 * svakom koraku klizača unutar istog dana.
 */
export function useAstronomySync(): void {
  const ephemerisRefetchKey = useMoonTransitStore(
    (s) => s.ephemerisRefetchKey
  );
  const setMoonRiseSet = useMoonTransitStore((s) => s.setMoonRiseSet);
  const lat = useObserverStore((s) => s.observer.lat);
  const lng = useObserverStore((s) => s.observer.lng);
  const groundHeightMeters = useObserverStore((s) => s.observer.groundHeightMeters);

  const observerKey = useMemo(
    () => `${lat.toFixed(5)}:${lng.toFixed(5)}`,
    [lat, lng]
  );

  useEffect(() => {
    const { referenceEpochMs } = useMoonTransitStore.getState();
    const m = AstroService.getMoonTimes(
      new Date(referenceEpochMs),
      lat,
      lng,
      groundHeightMeters ?? 0
    );
    setMoonRiseSet({
      moonRise: m.rise,
      moonSet: m.set,
      moonRiseSetKind: m.kind,
    });
  }, [
    ephemerisRefetchKey,
    observerKey,
    setMoonRiseSet,
    lat,
    lng,
    groundHeightMeters,
  ]);
}
