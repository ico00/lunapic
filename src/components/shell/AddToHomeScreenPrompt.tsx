"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_SNOOZE_UNTIL_MS = "moonTransitA2hsSnoozeUntilMs";
const STORAGE_NEVER = "moonTransitA2hsNeverAsk";

function isIosLike(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return true;
  }
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.matchMedia?.("(display-mode: standalone)").matches) {
    return true;
  }
  return Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone
  );
}

function readSnoozeUntilMs(): number | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }
  const raw = globalThis.localStorage.getItem(STORAGE_SNOOZE_UNTIL_MS);
  if (!raw) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function readNeverAsk(): boolean {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return false;
  }
  return globalThis.localStorage.getItem(STORAGE_NEVER) === "1";
}

/**
 * iOS Safari: educates users to install the PWA (Share → Add to Home Screen).
 * Shown once per snooze window; not shown when already running standalone.
 */
export function AddToHomeScreenPrompt() {
  const [open, setOpen] = useState(false);

  const snoozeDays = useCallback((days: number) => {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      const until = Date.now() + days * 86_400_000;
      globalThis.localStorage.setItem(STORAGE_SNOOZE_UNTIL_MS, String(until));
    }
    setOpen(false);
  }, []);

  const neverAsk = useCallback(() => {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      globalThis.localStorage.setItem(STORAGE_NEVER, "1");
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (typeof globalThis === "undefined") {
      return;
    }
    if (!globalThis.isSecureContext) {
      return;
    }
    if (!isIosLike()) {
      return;
    }
    if (isStandalonePwa()) {
      return;
    }
    if (readNeverAsk()) {
      return;
    }
    const snoozeUntil = readSnoozeUntilMs();
    if (snoozeUntil != null && Date.now() < snoozeUntil) {
      return;
    }
    const id = globalThis.setTimeout(() => {
      setOpen(true);
    }, 1600);
    return () => {
      globalThis.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        snoozeDays(7);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
    };
  }, [open, snoozeDays]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 sm:items-center sm:pb-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="a2hs-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Dismiss"
        onClick={() => {
          snoozeDays(7);
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-5">
        <h2
          id="a2hs-title"
          className="text-base font-semibold tracking-tight text-zinc-50"
        >
          Add LunaPic to your Home Screen
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          For the best field experience on iPhone (including notifications),
          install this page as an app: tap{" "}
          <span className="font-medium text-zinc-200">Share</span>, then{" "}
          <span className="font-medium text-zinc-200">Add to Home Screen</span>.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-sm text-zinc-300">
          <li>Tap the Share icon in Safari’s toolbar.</li>
          <li>Scroll and choose “Add to Home Screen”.</li>
          <li>Open LunaPic from your new home screen icon.</li>
        </ol>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => {
              snoozeDays(7);
            }}
            className="rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-zinc-200 sm:order-2"
          >
            Remind me in 7 days
          </button>
          <button
            type="button"
            onClick={neverAsk}
            className="rounded-xl border border-zinc-700/80 px-4 py-2.5 text-sm text-zinc-500 sm:order-3"
          >
            Don’t show again
          </button>
        </div>
      </div>
    </div>
  );
}
