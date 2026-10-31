"use client";

import {
  playActiveTransitAlert,
  playTransitCandidateAlert,
} from "@/lib/audio/fieldAudio";
import type { ActiveTransitRow } from "@/hooks/useActiveTransits";
import type { TransitCandidate } from "@/types";
import {
  canAlertActive,
  canAlertCandidate,
  stampActiveAlert,
  stampCandidateAlert,
  type AlertCooldowns,
} from "@/lib/domain/transit/alertCooldown";
import { confirmedCandidateIds, type CandidateConfirmationState } from "@/lib/domain/transit/candidateConfirmation";
import { useObserverStore } from "@/stores/observer-store";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const confirmation = useRef<CandidateConfirmationState>(new Map());
  const previousContext = useRef("");
  const observer = useObserverStore((s) => s.observer);
  const focal = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const sensor = useMoonTransitStore((s) => s.cameraSensorType);
  const planned = useMoonTransitStore((s) => s.timeAnchorIsPlanned);
  const context = `${observer.lat}|${observer.lng}|${observer.groundHeightMeters}|${focal}|${sensor}|${planned}`;
  const cooldowns = useRef<AlertCooldowns>(new Map());

  const clearAlert = useCallback(() => setLatestAlert(null), []);

  useEffect(() => {
    if (!enabled || previousContext.current !== context) {
      confirmation.current.clear();
      lastCandidateIds.current.clear();
      previousContext.current = context;
    }
    if (!enabled) return;

    const currentCandidateIds = confirmedCandidateIds(confirmation.current, candidates, Date.now());
    const currentActiveIds = new Set(activeTransits.map((r) => r.flight.id));

    // --- Active transits (priority — check first) ---
    for (const row of activeTransits) {
      const id = row.flight.id;
      if (lastActiveIds.current.has(id)) continue;
      if (!canAlertActive(cooldowns.current, id, Date.now())) continue;

      const callsign = row.flight.callSign?.trim() || id;
      const separation = row.separationDeg;

      stampActiveAlert(cooldowns.current, id, Date.now());

      // In-app UX only (audio + toast) for the visible tab. Background / screen-off
      // notifications are owned by the server-side scan (/api/transit/scan).
      if (audioEnabled) playActiveTransitAlert();
      setLatestAlert({ flightId: id, callsign, separationDeg: separation, isActive: true, nudgeLine: row.nudgeLine });
    }

    // --- New candidates (only disc-transit predictions, not "in frame" only) ---
    for (const c of candidates.filter((c) => currentCandidateIds.has(c.flight.id))) {
      const id = c.flight.id;
      if (lastCandidateIds.current.has(id)) continue;
      if (currentActiveIds.has(id)) continue; // active transit already handled above
      if (!canAlertCandidate(cooldowns.current, id, Date.now())) continue;

      const callsign = c.flight.callSign?.trim() || id;
      const separation = c.separationDeg;

      stampCandidateAlert(cooldowns.current, id, Date.now());

      if (audioEnabled) playTransitCandidateAlert();
      setLatestAlert({ flightId: id, callsign, separationDeg: separation, isActive: false, nudgeLine: null });
    }

    lastCandidateIds.current = currentCandidateIds;
    lastActiveIds.current = currentActiveIds;
  }, [enabled, audioEnabled, candidates, activeTransits, context]);

  return { latestAlert, clearAlert };
}
