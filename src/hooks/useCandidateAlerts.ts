"use client";

import {
  playActiveTransitAlert,
  playTransitCandidateAlert,
} from "@/lib/audio/fieldAudio";
import type { ActiveTransitRow } from "@/hooks/useActiveTransits";
import type { TransitCandidate } from "@/types";
import { useCallback, useEffect, useRef, useState } from "react";

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

      stamp(id);

      // In-app UX only (audio + toast) for the visible tab. Background / screen-off
      // notifications are owned by the server-side scan (/api/transit/scan).
      if (audioEnabled) playActiveTransitAlert();
      /* eslint-disable react-hooks/set-state-in-effect -- alert state is driven by external flight data changes */
      setLatestAlert({ flightId: id, callsign, separationDeg: separation, isActive: true, nudgeLine: row.nudgeLine });
      /* eslint-enable react-hooks/set-state-in-effect */
    }

    // --- New candidates (only disc-transit predictions, not "in frame" only) ---
    for (const c of candidates.filter((c) => c.willTransit)) {
      const id = c.flight.id;
      if (lastCandidateIds.current.has(id)) continue;
      if (currentActiveIds.has(id)) continue; // active transit already handled above
      if (!isCooled(id)) continue;

      const callsign = c.flight.callSign?.trim() || id;
      const separation = c.separationDeg;

      stamp(id);

      if (audioEnabled) playTransitCandidateAlert();
      setLatestAlert({ flightId: id, callsign, separationDeg: separation, isActive: false, nudgeLine: null });
    }

    lastCandidateIds.current = currentCandidateIds;
    lastActiveIds.current = currentActiveIds;
  }, [enabled, audioEnabled, candidates, activeTransits]);

  return { latestAlert, clearAlert };
}
