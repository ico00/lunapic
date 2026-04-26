import { useObserverStore } from "@/stores/observer-store";
import { useCallback, useState } from "react";

export type UseGpsObserverResult = {
  busy: boolean;
  error: string | null;
  /**
   * Traži geolokaciju i ažurira `observer` u storeu (ako nije zaključan).
   */
  requestFix: () => void;
};

/**
 * Orkestracija `navigator.geolocation` → `useObserverStore` (bez UI logike).
 */
export function useGpsObserver(): UseGpsObserverResult {
  const observerLocationLocked = useObserverStore(
    (s) => s.observerLocationLocked
  );
  const setObserver = useObserverStore((s) => s.setObserver);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestFix = useCallback(() => {
    if (observerLocationLocked) {
      setError("Location is locked. Unlock in the Field section.");
      return;
    }
    if (!globalThis.isSecureContext) {
      setError("GPS only works in a secure context (https).");
      return;
    }
    if (!("geolocation" in globalThis.navigator)) {
      setError("Geolocation is not supported.");
      return;
    }
    setBusy(true);
    setError(null);
    globalThis.navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObserver({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          groundHeightMeters:
            pos.coords.altitude != null && !Number.isNaN(pos.coords.altitude)
              ? pos.coords.altitude
              : 0,
        });
        setBusy(false);
      },
      (err) => {
        setError(err.message);
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    );
  }, [setObserver, observerLocationLocked]);

  return { busy, error, requestFix };
}
