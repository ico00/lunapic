import { getCloudCover } from "@/lib/domain/weather/weatherService";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useWeatherStore } from "@/stores/weather-store";
import { useEffect } from "react";

/**
 * Syncs `weather-store` with Open-Meteo for the fixed observer and simulated
 * `referenceEpochMs` (same ephemeris anchor as the time slider).
 */
export function useWeatherSync(): void {
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const observer = useObserverStore((s) => s.observer);
  const setCloudCover = useWeatherStore((s) => s.setCloudCover);
  const setWeatherLoading = useWeatherStore((s) => s.setLoading);
  const setWeatherError = useWeatherStore((s) => s.setError);

  useEffect(() => {
    if (referenceEpochMs <= 0) {
      setCloudCover(null);
      setWeatherError(null);
      setWeatherLoading(false);
      return;
    }
    const ac = new AbortController();
    setWeatherLoading(true);
    setWeatherError(null);
    void getCloudCover(observer.lat, observer.lng, referenceEpochMs, ac.signal)
      .then((pct) => {
        if (ac.signal.aborted) {
          return;
        }
        setCloudCover(pct);
        if (pct == null) {
          setWeatherError("unavailable");
        } else {
          setWeatherError(null);
        }
      })
      .catch((e) => {
        if (ac.signal.aborted) {
          return;
        }
        setCloudCover(null);
        setWeatherError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setWeatherLoading(false);
        }
      });
    return () => {
      ac.abort();
    };
  }, [
    observer.lat,
    observer.lng,
    referenceEpochMs,
    setCloudCover,
    setWeatherError,
    setWeatherLoading,
  ]);
}
