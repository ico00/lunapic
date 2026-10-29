"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_SNOOZE_KEY = "moonTransitNotifSnoozeUntilMs";
const STORAGE_NEVER_KEY = "moonTransitNotifNeverAsk";
const SHOW_DELAY_MS = 2_000;

function readNeverAsk(): boolean {
  try { return globalThis.localStorage?.getItem(STORAGE_NEVER_KEY) === "1"; }
  catch { return false; }
}

function readSnoozeUntilMs(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_SNOOZE_KEY);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

function writeNever() {
  try { globalThis.localStorage?.setItem(STORAGE_NEVER_KEY, "1"); } catch {}
}

function writeSnooze(days: number) {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_SNOOZE_KEY,
      String(Date.now() + days * 86_400_000)
    );
  } catch {}
}

type Props = {
  supported: boolean;
  onAllow: () => void;
};

export function NotificationPermissionPrompt({ supported, onAllow }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!supported) return;
    if (typeof Notification === "undefined") return;
    // Already decided — don't bother
    if (Notification.permission !== "default") return;
    if (readNeverAsk()) return;
    const snooze = readSnoozeUntilMs();
    if (snooze != null && Date.now() < snooze) return;

    const id = globalThis.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => globalThis.clearTimeout(id);
  }, [supported]);

  const allow = useCallback(() => {
    onAllow();
    setOpen(false);
  }, [onAllow]);

  const snoozeDays = useCallback((days: number) => {
    writeSnooze(days);
    setOpen(false);
  }, []);

  const neverAsk = useCallback(() => {
    writeNever();
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 sm:items-center sm:pb-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-prompt-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label="Dismiss"
        onClick={() => snoozeDays(3)}
      />
      <div className="relative z-10 w-full max-w-md rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--observer)] text-[color:var(--observer-text)]">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Z" />
              <path d="M18 16v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2h16l-2-2Z" />
            </svg>
          </span>
          <div>
            <h2
              id="notif-prompt-title"
              className="text-[length:var(--fs-body-strong)] font-semibold tracking-tight text-[color:var(--t-primary)]"
            >
              Enable transit alerts
            </h2>
            <p className="mt-1.5 text-[length:var(--fs-body)] leading-relaxed text-[color:var(--t-tertiary)]">
              Get a sound and push notification when an aircraft approaches the moon — even when LunaPic is in the background.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={allow}
            className="mt-btn mt-btn-primary sm:order-1"
          >
            Allow notifications
          </button>
          <button
            type="button"
            onClick={() => snoozeDays(3)}
            className="mt-btn sm:order-2"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={neverAsk}
            className="mt-btn border-transparent bg-transparent font-medium text-[color:var(--ink-3)] sm:order-3"
          >
            Don&apos;t ask again
          </button>
        </div>
      </div>
    </div>
  );
}
