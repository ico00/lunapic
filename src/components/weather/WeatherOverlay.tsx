"use client";

import { useWeatherStore } from "@/stores/weather-store";

/**
 * Read-only display of cloud forecast state from `useWeatherStore`.
 * Data is populated by `useWeatherSync` (Open-Meteo, observer + simulated time).
 */
/** Od ovog postotka oblaka chip dobiva upozorenje (Mjesec je vjerojatno skriven). */
const CLOUD_WARN_PERCENT = 70;

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

  const warn = cloudCoverPercent != null && cloudCoverPercent >= CLOUD_WARN_PERCENT;

  return (
    <div className="pointer-events-none flex min-w-0 shrink-0 items-center self-center">
      <div
        className={`flex h-[38px] min-w-0 items-center gap-2 rounded-[var(--r-ctl)] border bg-[color:var(--panel)] px-3 text-[length:var(--fs-meta)] font-semibold text-[color:var(--ink-2)] max-md:h-9 max-md:border-transparent max-md:bg-transparent max-md:px-1 ${
          warn ? "border-[color:var(--moon-line)]" : "border-[color:var(--hair)]"
        }`}
        title={title}
        aria-live="polite"
      >
        <svg
          className={`size-[18px] shrink-0 ${warn ? "text-[color:var(--moon)]" : "text-[color:var(--ink-3)]"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
        </svg>
        {weatherLoading ? (
          <span className="text-[color:var(--ink-3)]">…</span>
        ) : cloudCoverPercent != null ? (
          <span>
            <b className="font-extrabold text-[color:var(--ink)]">{cloudCoverPercent}%</b> clouds
          </span>
        ) : (
          <span className="text-[color:var(--ink-3)]">—</span>
        )}
      </div>
    </div>
  );
}
