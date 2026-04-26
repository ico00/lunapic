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

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-10 p-3"
      title={
        weatherLoading
          ? "Loading cloud forecast…"
          : cloudCoverPercent != null
            ? "Forecast cloud cover (Open-Meteo) at observer for simulated time"
            : weatherError && weatherError !== "unavailable"
              ? weatherError
              : "No hourly cloud data for this time"
      }
    >
      <div
        className="flex max-w-[min(100%,12rem)] items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/90 px-2.5 py-1.5 text-xs text-zinc-200 shadow-lg backdrop-blur"
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
