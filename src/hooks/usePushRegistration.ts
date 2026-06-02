"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useObserverStore } from "@/stores/observer-store";
import { useMoonTransitStore } from "@/stores/moon-transit-store";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Debounce za re-upsert pretplate kad se promijeni lokacija/kamera. */
const RESUBSCRIBE_DEBOUNCE_MS = 2_000;

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
  const endpointRef = useRef<string | null>(null);

  // Subscribed-to selectors drive the debounced re-upsert effect below; the
  // freshest values are read via getState() inside the callback (avoids stale refs).
  const observer = useObserverStore((s) => s.observer);
  const focalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const sensorType = useMoonTransitStore((s) => s.cameraSensorType);

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

  /** POST pretplatu s trenutnom lokacijom + kamerom (upsert po endpointu). */
  const upsertSubscription = useCallback(async (sub: PushSubscription) => {
    const observer = useObserverStore.getState().observer;
    const { cameraFocalLengthMm: focalLengthMm, cameraSensorType: sensorType } =
      useMoonTransitStore.getState();
    await fetch(`${BASE_PATH}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        observer: {
          lat: observer.lat,
          lng: observer.lng,
          groundHeightMeters: observer.groundHeightMeters,
        },
        camera: { focalLengthMm, sensorType },
      }),
    });
  }, []);

  const doSubscribe = useCallback(async () => {
    if (!supported || subscribedRef.current) return;
    try {
      const reg = regRef.current ?? (await navigator.serviceWorker.ready);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      await upsertSubscription(sub);
      endpointRef.current = sub.endpoint;
      subscribedRef.current = true;
      setReady(true);
    } catch {
      // Permission denied or not supported — fail silently
    }
  }, [supported, upsertSubscription]);

  /** Otkaži pretplatu na serveru (toggle OFF) — server prestaje slati push. */
  const unsubscribe = useCallback(async () => {
    const endpoint = endpointRef.current;
    if (!endpoint) return;
    try {
      await fetch(`${BASE_PATH}/api/push/subscribe`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
    } catch {
      // ignore
    }
    subscribedRef.current = false;
    endpointRef.current = null;
    setReady(false);
  }, []);

  // On desktop: auto-subscribe from effect (no gesture restriction).
  // On iOS PWA: subscribe() must be called from a user gesture (click handler).
  // When disabled, tear down the server-side subscription.
  useEffect(() => {
    if (!supported) return;
    if (enabled) {
      // setReady is updated asynchronously after the push subscription resolves —
      // this is an external-system sync, not a synchronous render cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!isIos()) void doSubscribe();
    } else {
      void unsubscribe();
    }
  }, [enabled, supported, doSubscribe, unsubscribe]);

  // Re-upsert (debounced) when observer/camera changes while subscribed, so the
  // server-side scan always uses the device's current location and FOV.
  useEffect(() => {
    if (!subscribedRef.current) return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const reg = regRef.current ?? (await navigator.serviceWorker.ready);
          const sub = await reg.pushManager.getSubscription();
          if (sub) await upsertSubscription(sub);
        } catch {
          // ignore
        }
      })();
    }, RESUBSCRIBE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [observer, focalLengthMm, sensorType, upsertSubscription]);

  // Expose for click handlers (iOS-safe).
  const subscribeToPush = useCallback(() => {
    void doSubscribe();
  }, [doSubscribe]);

  return { supported, ready, subscribeToPush };
}
