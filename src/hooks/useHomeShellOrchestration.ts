import { useActiveTransits } from "@/hooks/useActiveTransits";
import { useGpsObserver } from "@/hooks/useGpsObserver";
import { useNearestTransitWindow } from "@/hooks/useNearestTransitWindow";
import {
  usePhotographerTools,
  useTransitBeep,
} from "@/hooks/usePhotographerTools";
import {
  useMoonStateComputed,
  useTransitCandidates,
} from "@/hooks/useTransitCandidates";
import { getFlightProvider } from "@/lib/flight/flightProviderRegistry";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * Sav state, store subscriptioni i pomoćni hookovi za `HomePageClient` (jedan izvor orkestracije).
 */
export function useHomeShellOrchestration() {
  const flightProviderId = useMoonTransitStore((s) => s.flightProvider);
  const setFlightProvider = useMoonTransitStore((s) => s.setFlightProvider);
  const flightProvider = useMemo(
    () => getFlightProvider(flightProviderId),
    [flightProviderId]
  );

  const moon = useMoonStateComputed();
  const candidates = useTransitCandidates();
  const isLoading = useMoonTransitStore((s) => s.isLoading);
  const setSelectedFlightId = useMoonTransitStore(
    (s) => s.setSelectedFlightId
  );
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const { pack: photoPack } = usePhotographerTools();
  const [beepOnTransit, setBeepOnTransit] = useState(false);
  useTransitBeep(photoPack?.timeToAlignmentSec ?? null, beepOnTransit);
  const routeCorridor =
    flightProvider.getRouteCorridorStats?.() ?? null;
  const error = useMoonTransitStore((s) => s.error);
  const setTimeOffsetMs = useMoonTransitStore((s) => s.setTimeOffsetMs);
  const timeOffsetMs = useMoonTransitStore((s) => s.timeOffsetMs);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const syncTimeToNow = useMoonTransitStore((s) => s.syncTimeToNow);
  const activeTransits = useActiveTransits(0.5);
  const isGolden = useMemo(
    () => activeTransits.some((r) => r.deltaAzDeg < 0.1),
    [activeTransits]
  );
  const nearestWindow = useNearestTransitWindow();
  const [goldenFlashToken, setGoldenFlashToken] = useState<number | null>(null);
  const wasGoldenRef = useRef(false);
  useEffect(() => {
    if (isGolden && !wasGoldenRef.current) {
      setGoldenFlashToken(Date.now());
    }
    wasGoldenRef.current = isGolden;
  }, [isGolden]);
  const [ephemerisReady, setEphemerisReady] = useState(false);

  const obs = useObserverStore((s) => s.observer);
  const observerLocationLocked = useObserverStore(
    (s) => s.observerLocationLocked
  );
  const requestFocusOnObserver = useObserverStore(
    (s) => s.requestFocusOnObserver
  );
  const { requestFix: onUseGps, busy: gpsBusy, error: gpsError } =
    useGpsObserver();
  useLayoutEffect(() => {
    syncTimeToNow();
    queueMicrotask(() => {
      setEphemerisReady(true);
    });
  }, [syncTimeToNow]);

  const syncTime = useCallback(() => {
    syncTimeToNow();
  }, [syncTimeToNow]);

  const offsetHours = timeOffsetMs / 3_600_000;
  const onSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTimeOffsetMs(parseFloat(e.target.value) * 3_600_000);
    },
    [setTimeOffsetMs]
  );

  const showEphemeris = ephemerisReady;
  const moonDisplay = (v: string) => (showEphemeris ? v : "—");
  const candidatesDisplay = showEphemeris ? candidates : [];
  const showEmptyCandidates =
    showEphemeris && candidates.length === 0 && !isLoading;

  return {
    flightProviderId,
    setFlightProvider,
    flightProvider,
    moon,
    isLoading,
    setSelectedFlightId,
    selectedFlightId,
    photoPack,
    beepOnTransit,
    setBeepOnTransit,
    routeCorridor,
    error,
    timeOffsetMs,
    referenceEpochMs,
    activeTransits,
    isGolden,
    nearestWindow,
    goldenFlashToken,
    setGoldenFlashToken,
    obs,
    observerLocationLocked,
    requestFocusOnObserver,
    onUseGps,
    gpsBusy,
    gpsError,
    syncTime,
    offsetHours,
    onSlider,
    showEphemeris,
    moonDisplay,
    candidatesDisplay,
    showEmptyCandidates,
  };
}
