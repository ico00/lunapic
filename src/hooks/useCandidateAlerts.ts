"use client";

import {
  playActiveTransitAlert,
  playTransitCandidateAlert,
} from "@/lib/audio/fieldAudio";
import type { ActiveTransitRow } from "@/hooks/useActiveTransits";
import type { TransitCandidate } from "@/types";
import { useCallback, useEffect, useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const COOLDOWN_MS = 2 * 60 * 1000;

export type AlertInfo = {
  flightId: string;
  callsign: string;
  separationDeg: number;
  isActive: boolean;
  /** Nudge instruction for active transits, e.g. "Move about 42 m toward the south-west." */
  nudgeLine: string | null;
};

export type UseCandidateAlertsResult = {
  latestAlert: AlertInfo | null;
  clearAlert: () => void;
};

type Args = {
  enabled: boolean;
  audioEnabled: boolean;
  candidates: readonly TransitCandidate[];
  activeTransits: readonly ActiveTransitRow[];
};

async function sendPush(title: string, body: string, tag: string, urgent: boolean) {
  try {
    await fetch(`${BASE_PATH}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, tag, urgent }),
    });
  } catch {
    // network error — push will be missed, not fatal
  }
}

export function useCandidateAlerts({
  enabled,
  audioEnabled,
  candidates,
  activeTransits,
}: Args): UseCandidateAlertsResult {
  const [latestAlert, setLatestAlert] = useState<AlertInfo | null>(null);
  const lastCandidateIds = useRef<Set<string>>(new Set());
  const lastActiveIds = useRef<Set<string>>(new Set());
  const cooldownMap = useRef<Map<string, number>>(new Map());

  const clearAlert = useCallback(() => setLatestAlert(null), []);

  function isCooled(id: string): boolean {
    const last = cooldownMap.current.get(id) ?? 0;
    return Date.now() - last >= COOLDOWN_MS;
  }

  function stamp(id: string) {
    cooldownMap.current.set(id, Date.now());
  }

  useEffect(() => {
    if (!enabled) return;

    // Only track disc-transit candidates (willTransit: true) — "in frame" planes never trigger alerts
    const currentCandidateIds = new Set(
      candidates.filter((c) => c.willTransit).map((c) => c.flight.id),
    );
    const currentActiveIds = new Set(activeTransits.map((r) => r.flight.id));

    // --- Active transits (priority — check first) ---
    for (const row of activeTransits) {
      const id = row.flight.id;
      if (lastActiveIds.current.has(id)) continue;
      if (!isCooled(id)) continue;

      const callsign = row.flight.callSign?.trim() || id;
      const separation = row.separationDeg;
      const title = "LunaPic — active transit!";
      const body = `${callsign} is crossing the moon now (${separation.toFixed(2)}°)`;

      stamp(id);

      if (document.hidden) {
        void sendPush(title, body, `transit-active-${id}`, true);
      } else {
        if (audioEnabled) playActiveTransitAlert();
        /* eslint-disable react-hooks/set-state-in-effect -- alert state is driven by external flight data changes */
        setLatestAlert({ flightId: id, callsign, separationDeg: separation, isActive: true, nudgeLine: row.nudgeLine });
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    }

    // --- New candidates (only disc-transit predictions, not "in frame" only) ---
    for (const c of candidates.filter((c) => c.willTransit)) {
      const id = c.flight.id;
      if (lastCandidateIds.current.has(id)) continue;
      if (currentActiveIds.has(id)) continue; // active transit already handled above
      if (!isCooled(id)) continue;

      const callsign = c.flight.callSign?.trim() || id;
      const separation = c.separationDeg;
      const title = "LunaPic — transit candidate";
      const body = `${callsign} approaching moon (${separation.toFixed(2)}°)`;

      stamp(id);

      if (document.hidden) {
        void sendPush(title, body, `transit-candidate-${id}`, false);
      } else {
        if (audioEnabled) playTransitCandidateAlert();
        setLatestAlert({ flightId: id, callsign, separationDeg: separation, isActive: false, nudgeLine: null }); // eslint-disable-line react-hooks/set-state-in-effect
      }
    }

    lastCandidateIds.current = currentCandidateIds;
    lastActiveIds.current = currentActiveIds;
  }, [enabled, audioEnabled, candidates, activeTransits]);

  return { latestAlert, clearAlert };
}
