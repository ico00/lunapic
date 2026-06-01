"use client";

import { useEffect } from "react";
import type { AlertInfo } from "@/hooks/useCandidateAlerts";

type Props = {
  alert: AlertInfo;
  onDismiss: () => void;
  onSelect: (flightId: string) => void;
};

const AUTO_DISMISS_MS = 8_000;

export function TransitAlertToast({ alert, onDismiss, onSelect }: Props) {
  useEffect(() => {
    const id = globalThis.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => globalThis.clearTimeout(id);
  }, [alert, onDismiss]);

  const isActive = alert.isActive;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        // Mobile: ispod altitude/layers panela (top). Desktop: fiksno od dna.
        "pointer-events-auto fixed left-1/2 z-[230] flex -translate-x-1/2 items-stretch overflow-hidden rounded-2xl border shadow-2xl shadow-black/60 backdrop-blur-2xl",
        "top-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)] md:top-auto md:bottom-[4.5rem]",
        isActive
          ? "border-amber-400/40 bg-amber-500/[0.15]"
          : "border-emerald-400/40 bg-emerald-500/[0.12]",
      ].join(" ")}
    >
      {/* Klikabilno tijelo — selektira avion */}
      <button
        type="button"
        onClick={() => {
          onSelect(alert.flightId);
          onDismiss();
        }}
        className="flex items-center gap-3 px-4 py-3 text-left transition active:opacity-70"
      >
        <span
          className={[
            "size-2 shrink-0 animate-pulse rounded-full shadow-[0_0_8px_currentColor]",
            isActive ? "bg-amber-400 text-amber-400" : "bg-emerald-400 text-emerald-400",
          ].join(" ")}
        />
        <div className="min-w-0">
          <p
            className={[
              "text-[length:var(--fs-label)] font-semibold leading-tight",
              isActive ? "text-amber-300" : "text-emerald-300",
            ].join(" ")}
          >
            {isActive ? "Active transit" : "Transit candidate"}
          </p>
          <p className="text-[length:var(--fs-meta)] text-[color:var(--t-secondary)] leading-tight">
            {alert.callsign} &mdash; {alert.separationDeg.toFixed(2)}&deg;
          </p>
          {isActive && alert.nudgeLine && (
            <p className="text-[length:var(--fs-meta)] text-amber-200/80 leading-tight mt-0.5">
              {alert.nudgeLine}
            </p>
          )}
        </div>
      </button>

      {/* Dismiss tipka — odvojena od klika na avion */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss alert"
        className="flex items-center px-3 text-[color:var(--t-tertiary)] transition hover:text-[color:var(--t-primary)] border-l border-white/[0.08]"
      >
        ✕
      </button>
    </div>
  );
}
