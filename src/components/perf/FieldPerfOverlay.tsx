"use client";

import { fieldPerfControl, getFieldPerfSnapshot, isFieldPerfEnabled } from "@/lib/perf/fieldPerf";
import { useEffect, useState } from "react";

/**
 * In-field HUD for hook / Mapbox timings. Enable with env or
 * `localStorage.setItem(fieldPerfControl.storageKey, "1")` + reload.
 */
export function FieldPerfOverlay() {
  const enabled = isFieldPerfEnabled();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const poll = setInterval(() => {
      setTick((n) => n + 1);
    }, 500);
    const onEvt = () => {
      setTick((n) => n + 1);
    };
    globalThis.addEventListener("moon-transit-field-perf", onEvt);
    return () => {
      clearInterval(poll);
      globalThis.removeEventListener("moon-transit-field-perf", onEvt);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const { entries } = getFieldPerfSnapshot();

  return (
    <div
      className="pointer-events-none absolute right-2 top-2 z-20 w-[min(20rem,92vw)] max-h-[40vh] overflow-y-auto rounded-lg border border-violet-900/50 bg-zinc-950/92 px-2 py-1.5 font-mono text-[10px] leading-snug text-violet-100 shadow-lg backdrop-blur"
      aria-label="Field performance"
      data-testid="field-perf-overlay"
    >
      <div className="mb-1 text-[9px] font-sans font-medium tracking-wide text-violet-300/90">
        Field performance (dev)
      </div>
      {entries.length === 0 ? (
        <p className="text-zinc-500">Pan the map; timings appear after input.</p>
      ) : (
        <ul className="space-y-0.5">
          {entries.map((e) => (
            <li key={e.name} className="flex justify-between gap-2">
              <span className="truncate text-violet-200/80" title={e.name}>
                {e.name}
              </span>
              <span className="shrink-0 text-zinc-300">
                {e.last.toFixed(2)} ms
                {e.n > 1 && (
                  <span className="text-zinc-500"> ~{e.avg.toFixed(2)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 border-t border-zinc-800/80 pt-1 text-[9px] text-zinc-500">
        Clear: <code className="text-zinc-400">localStorage.removeItem(&apos;{fieldPerfControl.storageKey}&apos;)</code> and reload. See
        <code className="ml-0.5 text-zinc-400"> documentation/performance.md</code>.
      </p>
    </div>
  );
}
