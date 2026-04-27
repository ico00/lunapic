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
        className="flex h-full w-full min-w-0 items-center justify-start gap-1.5 rounded-xl border border-white/[0.09] bg-gradient-to-br from-zinc-900/75 to-zinc-950/90 px-2.5 py-1.5 text-xs text-zinc-100 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.05] backdrop-blur-md"
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
