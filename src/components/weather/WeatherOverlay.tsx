"use client";

import { useWeatherStore } from "@/stores/weather-store";

/**
 * Read-only display of cloud forecast state from `useWeatherStore`.
 * Data is populated by `useWeatherSync` (Open-Meteo, observer + simulated time).
 */
export function WeatherOverlay() {
  const cloudCoverPercent = useWeatherStore((s) => s.cloudCoverPercent);
  const weatherLoading = useWeatherStore((s) => s.isLoading);
  const weatherError = useWeatherStore((s) => s.error);

  const title =
    weatherLoading
      ? "Loading cloud forecast…"
      : cloudCoverPercent != null
        ? "Forecast cloud cover (Open-Meteo) at observer for simulated time"
        : weatherError && weatherError !== "unavailable"
          ? weatherError
          : "No hourly cloud data for this time";

  return (
    <div className="pointer-events-none flex min-w-0 shrink-0 items-center self-center">
      <div
        className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-200"
        title={title}
        aria-live="polite"
      >
        <span className="shrink-0" aria-hidden>
          ☁️
        </span>
        {weatherLoading ? (
          <span className="text-zinc-500">…</span>
        ) : cloudCoverPercent != null ? (
          <span>{cloudCoverPercent}% Clouds</span>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </div>
    </div>
  );
}
