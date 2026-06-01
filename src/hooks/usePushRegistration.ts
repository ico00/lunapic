"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function checkSupported(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export type UsePushRegistrationResult = {
  supported: boolean;
  ready: boolean;
  /** Call this synchronously from a click/tap handler to subscribe on iOS. */
  subscribeToPush: () => void;
};

export function usePushRegistration(enabled: boolean): UsePushRegistrationResult {
  const [supported] = useState(checkSupported);
  const [ready, setReady] = useState(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const subscribedRef = useRef(false);

  // Register SW eagerly — no user gesture needed for registration.
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker
      .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
      .then((reg) => {
        regRef.current = reg;
      })
      .catch(() => {});
  }, [supported]);

  const doSubscribe = useCallback(async () => {
    if (!supported || subscribedRef.current) return;
    try {
      const reg =
        regRef.current ??
        (await navigator.serviceWorker.ready);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      await fetch(`${BASE_PATH}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      subscribedRef.current = true;
      /* eslint-disable react-hooks/set-state-in-effect -- async subscription result */
      setReady(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // Permission denied or not supported — fail silently
    }
  }, [supported]);

  // On desktop: auto-subscribe from effect (no gesture restriction).
  // On iOS PWA: subscribe() must be called from a user gesture (click handler).
  useEffect(() => {
    if (!enabled || !supported || isIos()) return;
    void doSubscribe();
  }, [enabled, supported, doSubscribe]);

  // Expose for click handlers (iOS-safe).
  const subscribeToPush = useCallback(() => {
    void doSubscribe();
  }, [doSubscribe]);

  return { supported, ready, subscribeToPush };
}
