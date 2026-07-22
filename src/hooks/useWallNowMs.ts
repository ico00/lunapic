import { useEffect, useRef, useState } from "react";

const DEFAULT_MIN_TICK_MS = 250;

/**
 * Ticking wall-clock "now" as reactive state (rAF-throttled), so consumers can
 * depend on it in `useMemo` instead of calling `Date.now()` during render —
 * same idiom as `useExtrapolatedFlightsForMap`'s local tick, extracted for reuse.
 */
export function useWallNowMs(minTickMs: number = DEFAULT_MIN_TICK_MS): number {
  const [wallNowMs, setWallNowMs] = useState(() => Date.now());
  const lastTickRef = useRef(0);

  useEffect(() => {
    let rafId: number;
    const tick = (ts: DOMHighResTimeStamp) => {
      if (ts - lastTickRef.current >= minTickMs) {
        lastTickRef.current = ts;
        setWallNowMs(Date.now());
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [minTickMs]);

  return wallNowMs;
}
