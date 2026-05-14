import { getWeatherData } from "@/lib/domain/weather/weatherService";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useWeatherStore } from "@/stores/weather-store";
import { useEffect } from "react";

/**
 * Syncs `weather-store` with Open-Meteo for the fixed observer and simulated
 * `referenceEpochMs` (same ephemeris anchor as the time slider).
 * Fetches cloud cover and atmospheric pressure-level data in one request.
 */
export function useWeatherSync(): void {
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const observer = useObserverStore((s) => s.observer);
  const setCloudCover = useWeatherStore((s) => s.setCloudCover);
  const setAtmosphericLevels = useWeatherStore((s) => s.setAtmosphericLevels);
  const setWeatherLoading = useWeatherStore((s) => s.setLoading);
  const setWeatherError = useWeatherStore((s) => s.setError);

  useEffect(() => {
    if (referenceEpochMs <= 0) {
      setCloudCover(null);
      setAtmosphericLevels(null);
      setWeatherError(null);
      setWeatherLoading(false);
      return;
    }
    const ac = new AbortController();
    setWeatherLoading(true);
    setWeatherError(null);
    void getWeatherData(observer.lat, observer.lng, referenceEpochMs, ac.signal)
      .then((data) => {
        if (ac.signal.aborted) return;
        setCloudCover(data.cloudCoverPercent);
        setAtmosphericLevels(data.atmosphericLevels);
        if (data.cloudCoverPercent == null) {
          setWeatherError("unavailable");
        } else {
          setWeatherError(null);
        }
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setCloudCover(null);
        setAtmosphericLevels(null);
        setWeatherError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!ac.signal.aborted) setWeatherLoading(false);
      });
    return () => {
      ac.abort();
    };
  }, [
    observer.lat,
    observer.lng,
    referenceEpochMs,
    setCloudCover,
    setAtmosphericLevels,
    setWeatherError,
    setWeatherLoading,
  ]);
}
