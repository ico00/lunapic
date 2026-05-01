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
    <div className="pointer-events-none w-full min-w-0 shrink-0 self-stretch">
      <div
        className="flex h-full w-full min-w-0 items-center justify-start gap-1.5 rounded-md border border-zinc-700 bg-gradient-to-br from-zinc-900/95 to-zinc-950 px-2.5 py-1.5 font-[family-name:var(--font-jetbrains-mono)] text-xs text-zinc-200 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.45)] ring-1 ring-zinc-800/80 backdrop-blur-md"
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
