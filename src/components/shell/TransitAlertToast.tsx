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
        // Mobile: ispod gornje trake. Desktop: fiksno od dna.
        "mt-note mt-note-disc pointer-events-auto fixed left-1/2 z-[230] flex -translate-x-1/2 items-stretch overflow-hidden !p-0",
        "top-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)] md:top-auto md:bottom-[4.5rem]",
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
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-[color:var(--disc)]" />
        <div className="min-w-0">
          <p className="text-[length:var(--fs-label)] font-bold leading-tight text-[color:var(--disc-text)]">
            {isActive ? "Active transit" : "Transit candidate"}
          </p>
          <p className="text-[length:var(--fs-meta)] text-[color:var(--t-secondary)] leading-tight">
            {alert.callsign} &mdash; {alert.separationDeg.toFixed(2)}&deg;
          </p>
          {isActive && alert.nudgeLine && (
            <p className="text-[length:var(--fs-meta)] text-[color:var(--ink)] leading-tight mt-0.5">
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
        className="flex items-center px-3 text-[color:var(--t-tertiary)] transition hover:text-[color:var(--t-primary)] border-l border-[color:var(--hair)]"
      >
        ✕
      </button>
    </div>
  );
}
