"use client";

import { formatFixed } from "@/lib/format/numbers";
import { useObserverStore } from "@/stores/observer-store";
import type { GroundObserver } from "@/types";
import { useEffect, useRef, useState } from "react";

type MapboxGeoFeature = {
  id: string;
  text: string;
  place_name: string;
  center: [number, number];
};

type ObserverLocationPanelProps = {
  observer: GroundObserver;
  onUseGps: () => void;
  gpsBusy: boolean;
  gpsError: string | null;
  locationActionsDisabled: boolean;
};

export function ObserverLocationPanel({
  observer,
  onUseGps,
  gpsBusy,
  gpsError,
  locationActionsDisabled,
}: ObserverLocationPanelProps) {
  const setObserver = useObserverStore((s) => s.setObserver);
  const requestFocusOnObserver = useObserverStore((s) => s.requestFocusOnObserver);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapboxGeoFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=5&types=address,place,locality,neighborhood,poi`;
        const res = await fetch(url);
        const data = (await res.json()) as { features: MapboxGeoFeature[] };
        setResults(data.features ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(feature: MapboxGeoFeature) {
    const [lng, lat] = feature.center;
    setObserver({ lat, lng });
    requestFocusOnObserver();
    setQuery(feature.place_name);
    setResults([]);
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-4">
      {/* Address search */}
      <div className="relative">
        <div className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 transition focus-within:border-white/[0.22] focus-within:ring-1 focus-within:ring-sky-500/30">
          <svg className="h-4 w-4 shrink-0 text-[color:var(--t-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search address or place…"
            aria-label="Search location"
            disabled={locationActionsDisabled}
            className="flex-1 min-w-0 bg-transparent text-[length:var(--fs-body)] text-[color:var(--t-primary)] outline-none placeholder:text-[color:var(--t-tertiary)] disabled:opacity-40"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {loading && (
            <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-[color:var(--t-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-3.5-7.1" />
            </svg>
          )}
          {query.length > 0 && !loading && (
            <button
              type="button"
              aria-label="Clear"
              onClick={handleClear}
              className="shrink-0 text-[color:var(--t-tertiary)] transition hover:text-[color:var(--t-primary)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-xl border border-white/[0.10] bg-[rgba(14,18,42,0.97)] shadow-xl backdrop-blur-xl">
            {results.map((feature) => (
              <button
                key={feature.id}
                type="button"
                onClick={() => handleSelect(feature)}
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
              >
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 22s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z" />
                  <circle cx="12" cy="10" r="2" />
                </svg>
                <div className="min-w-0">
                  <div className="truncate text-[length:var(--fs-body)] text-[color:var(--t-primary)]">{feature.text}</div>
                  <div className="truncate text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">{feature.place_name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Coordinates */}
      <dl className="space-y-1.5 font-mono text-[length:var(--fs-meta)] tabular-nums text-[color:var(--t-primary)]">
        <div className="flex justify-between gap-2">
          <dt className="text-[color:var(--t-tertiary)]">φ</dt>
          <dd>{formatFixed(observer.lat, 5)}°</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[color:var(--t-tertiary)]">λ</dt>
          <dd>{formatFixed(observer.lng, 5)}°</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[color:var(--t-tertiary)]">Elevation</dt>
          <dd>{formatFixed(observer.groundHeightMeters, 0)} m</dd>
        </div>
      </dl>

      {/* GPS button */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onUseGps}
          disabled={gpsBusy || locationActionsDisabled}
          className="min-h-[48px] rounded-2xl border border-sky-500/35 bg-sky-500/[0.10] px-3 py-3 text-[length:var(--fs-body)] font-semibold text-sky-200 transition hover:border-sky-400/55 hover:bg-sky-500/[0.16] active:scale-[0.98] disabled:opacity-50"
        >
          {gpsBusy ? "Locating…" : "Use my GPS"}
        </button>
        {gpsError && <p className="text-[length:var(--fs-meta)] text-rose-300">{gpsError}</p>}
      </div>
    </div>
  );
}
