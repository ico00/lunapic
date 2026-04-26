"use client";

import { useCallback, useEffect, useState } from "react";

type OrientWithCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

let cachedIosPerm: boolean | null = null;
function isIosRequestPermissionDevice(): boolean {
  if (cachedIosPerm != null) {
    return cachedIosPerm;
  }
  if (typeof globalThis === "undefined") {
    return false;
  }
  const w = globalThis as unknown as {
    DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
  };
  cachedIosPerm =
    typeof w.DeviceOrientationEvent?.requestPermission === "function";
  return cachedIosPerm;
}
function headingFromEvent(e: DeviceOrientationEvent): number | null {
  const w = e as OrientWithCompass;
  if (typeof w.webkitCompassHeading === "number" && w.webkitCompassHeading >= 0) {
    return w.webkitCompassHeading % 360;
  }
  if (e.alpha == null) {
    return null;
  }
  return (360 - e.alpha + 360) % 360;
}

export function useDeviceCompass() {
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [listening, setListening] = useState(
    () => !isIosRequestPermissionDevice()
  );
  const needPerm = isIosRequestPermissionDevice();

  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    setHeadingDeg(headingFromEvent(e));
  }, []);

  useEffect(() => {
    if (!listening) {
      return;
    }
    const h = (ev: Event) => onOrient(ev as DeviceOrientationEvent);
    globalThis.addEventListener("deviceorientation", h, true);
    return () => {
      globalThis.removeEventListener("deviceorientation", h, true);
    };
  }, [listening, onOrient]);

  const request = useCallback(async (): Promise<string | null> => {
    const w = globalThis as unknown as {
      DeviceOrientationEvent?: {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
    };
    if (w.DeviceOrientationEvent?.requestPermission) {
      try {
        const r = await w.DeviceOrientationEvent.requestPermission();
        if (r !== "granted") {
          return "Orientation permission denied.";
        }
      } catch {
        return "Could not request orientation.";
      }
    }
    setListening(true);
    return null;
  }, []);

  return {
    headingDeg,
    hasHeading: headingDeg != null,
    needPermission: needPerm,
    request,
    listening,
  } as const;
}
