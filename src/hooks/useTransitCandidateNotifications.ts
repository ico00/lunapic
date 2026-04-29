"use client";

import type { ActiveTransitRow } from "@/hooks/useActiveTransits";
import type { TransitCandidate } from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WATCHED_IDS_STORAGE_KEY = "moonTransitWatchedCandidateFlightIds";
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

type BrowserNotificationPermission = NotificationPermission | "unsupported";

type UseTransitCandidateNotificationsArgs = {
  candidates: readonly TransitCandidate[];
  activeTransits: readonly ActiveTransitRow[];
};

export type UseTransitCandidateNotificationsResult = {
  notificationsSupported: boolean;
  permission: BrowserNotificationPermission;
  watchedFlightIds: ReadonlySet<string>;
  toggleWatchForFlight: (flightId: string) => void;
};

function getInitialPermission(): BrowserNotificationPermission {
  if (typeof globalThis === "undefined" || !("Notification" in globalThis)) {
    return "unsupported";
  }
  return globalThis.Notification.permission;
}

function getInitialWatchedIds(): Set<string> {
  if (
    typeof globalThis === "undefined" ||
    !("localStorage" in globalThis)
  ) {
    return new Set();
  }
  const raw = globalThis.localStorage.getItem(WATCHED_IDS_STORAGE_KEY);
  if (!raw) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(
      parsed.filter((v): v is string => typeof v === "string")
    );
  } catch {
    return new Set();
  }
}

export function useTransitCandidateNotifications({
  candidates,
  activeTransits,
}: UseTransitCandidateNotificationsArgs): UseTransitCandidateNotificationsResult {
  /** SSR / prerender nema `Notification` — inicijalno neutralno, sync u mount effectu. */
  const [permission, setPermission] =
    useState<BrowserNotificationPermission>("unsupported");
  const [watchedFlightIds, setWatchedFlightIds] = useState<Set<string>>(
    () => new Set()
  );
  const lastNotifiedAtRef = useRef<Map<string, number>>(new Map());
  const skipFirstPersistRef = useRef(true);
  const candidatesById = useMemo(
    () => new Map(candidates.map((c) => [c.flight.id, c] as const)),
    [candidates]
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- client bootstrap: Notification + localStorage exist only after hydration */
    setPermission(getInitialPermission());
    setWatchedFlightIds(getInitialWatchedIds());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (
      typeof globalThis === "undefined" ||
      !("localStorage" in globalThis)
    ) {
      return;
    }
    if (skipFirstPersistRef.current) {
      skipFirstPersistRef.current = false;
      return;
    }
    globalThis.localStorage.setItem(
      WATCHED_IDS_STORAGE_KEY,
      JSON.stringify(Array.from(watchedFlightIds))
    );
  }, [watchedFlightIds]);

  useEffect(() => {
    if (permission === "unsupported" || permission !== "granted") {
      return;
    }
    for (const row of activeTransits) {
      const id = row.flight.id;
      if (!watchedFlightIds.has(id)) {
        continue;
      }
      const now = Date.now();
      const last = lastNotifiedAtRef.current.get(id) ?? 0;
      if (now - last < NOTIFY_COOLDOWN_MS) {
        continue;
      }
      const c = candidatesById.get(id);
      const callSign = row.flight.callSign?.trim() || id;
      const separation =
        c != null ? `${c.separationDeg.toFixed(3)}°` : `${row.deltaAzDeg.toFixed(3)}°`;
      const n = new Notification("Moon Transit candidate update", {
        body: `${callSign} is near alignment now (${separation}).`,
        tag: `moon-transit-candidate-${id}`,
      });
      n.onclick = () => {
        globalThis.focus();
      };
      lastNotifiedAtRef.current.set(id, now);
    }
  }, [activeTransits, candidatesById, permission, watchedFlightIds]);

  const toggleWatchForFlight = useCallback(
    async (flightId: string) => {
      if (permission !== "unsupported" && permission === "default") {
        const result = await globalThis.Notification.requestPermission();
        setPermission(result);
        if (result !== "granted") {
          return;
        }
      }
      setWatchedFlightIds((prev) => {
        const next = new Set(prev);
        if (next.has(flightId)) {
          next.delete(flightId);
        } else {
          next.add(flightId);
        }
        return next;
      });
    },
    [permission]
  );

  return {
    notificationsSupported: permission !== "unsupported",
    permission,
    watchedFlightIds,
    toggleWatchForFlight,
  };
}

