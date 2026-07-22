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
import { computeBestTransitHours } from "@/lib/domain/astro/bestTransitHours";
import { isMoonVisibleFromMoonState } from "@/lib/domain/astro/moonVisibility";
import { getTimeSliderWindowMs } from "@/lib/domain/astro/astroService";
import { isDefaultObserverLocation } from "@/lib/defaultObserverLocation";
import { getFlightProvider } from "@/lib/flight/flightProviderRegistry";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useWeatherStore } from "@/stores/weather-store";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * Sav state, store subscriptioni i pomoćni hookovi za `HomePageClient` (jedan izvor orkestracije).
 */
export function useHomeShellOrchestration() {
  const flightProviderId = useMoonTransitStore((s) => s.flightProvider);
  const ensureFlightSourceComboboxMode = useMoonTransitStore(
    (s) => s.ensureFlightSourceComboboxMode
  );
  useLayoutEffect(() => {
    ensureFlightSourceComboboxMode();
  }, [ensureFlightSourceComboboxMode]);
  const liveFlightFeeds = useMoonTransitStore((s) => s.liveFlightFeeds);
  const providerFlightCounts = useMoonTransitStore((s) => s.providerFlightCounts);
  const setLiveFlightFeeds = useMoonTransitStore(
    (s) => s.setLiveFlightFeeds
  );
  const flightProvider = useMemo(
    () => getFlightProvider(flightProviderId),
    [flightProviderId]
  );

  const moonRise = useMoonTransitStore((s) => s.moonRise);
  const moonSet = useMoonTransitStore((s) => s.moonSet);
  const moonRiseSetKind = useMoonTransitStore((s) => s.moonRiseSetKind);
  const isLoading = useMoonTransitStore((s) => s.isLoading);
  const setSelectedFlightId = useMoonTransitStore(
    (s) => s.setSelectedFlightId
  );
  const selectedFlightId = useMoonTransitStore((s) => s.selectedFlightId);
  const cloudCoverPercent = useWeatherStore((s) => s.cloudCoverPercent);
  const moon = useMoonStateComputed();
  const isMoonBelowHorizon = useMemo(
    () => !isMoonVisibleFromMoonState(moon),
    [moon]
  );
  const candidates = useTransitCandidates();
  const {
    pack: photoPack,
    shot: photoShotFeasibility,
    reason: photoUnavailableReason,
  } = usePhotographerTools();
  const [beepOnTransit, setBeepOnTransit] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  useTransitBeep(photoPack?.timeToAlignmentSec ?? null, beepOnTransit);
  const routeCorridor =
    flightProvider.getRouteCorridorStats?.() ?? null;
  const error = useMoonTransitStore((s) => s.error);
  const timeAnchorMs = useMoonTransitStore((s) => s.timeAnchorMs);
  const setTimeOffsetMs = useMoonTransitStore((s) => s.setTimeOffsetMs);
  const timeOffsetMs = useMoonTransitStore((s) => s.timeOffsetMs);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const timeSliderWindow = useMemo(
    () =>
      getTimeSliderWindowMs(referenceEpochMs, timeAnchorMs, {
        rise: moonRise,
        set: moonSet,
        kind: moonRiseSetKind,
      }),
    [referenceEpochMs, timeAnchorMs, moonRise, moonSet, moonRiseSetKind]
  );
  const timeSliderStartLabel = useMemo(
    () =>
      new Date(timeSliderWindow.t0).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [timeSliderWindow.t0]
  );
  const timeSliderEndLabel = useMemo(
    () =>
      new Date(timeSliderWindow.t1).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [timeSliderWindow.t1]
  );
  const sliderWidthHours = useMemo(
    () => (timeSliderWindow.t1 - timeSliderWindow.t0) / 3_600_000,
    [timeSliderWindow.t0, timeSliderWindow.t1]
  );
  const timeSliderMode = "forward24h" as const;
  const syncTimeToNow = useMoonTransitStore((s) => s.syncTimeToNow);
  const tickLiveTime = useMoonTransitStore((s) => s.tickLiveTime);
  const activeTransits = useActiveTransits(0.5);
  const isGolden = useMemo(
    () => activeTransits.some((r) => r.separationDeg < 0.1),
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
  useEffect(() => {
    if (observerLocationLocked) {
      return;
    }
    if (typeof globalThis === "undefined") {
      return;
    }
    if (!globalThis.isSecureContext) {
      return;
    }
    if (!("geolocation" in globalThis.navigator)) {
      return;
    }
    if (!isDefaultObserverLocation(obs)) {
      return;
    }
    queueMicrotask(() => {
      onUseGps();
    });
  }, [observerLocationLocked, onUseGps, obs]);
  useLayoutEffect(() => {
    syncTimeToNow();
    queueMicrotask(() => {
      setEphemerisReady(true);
    });
  }, [syncTimeToNow]);

  useEffect(() => {
    const id = setInterval(tickLiveTime, 30_000);
    return () => clearInterval(id);
  }, [tickLiveTime]);

  const syncTime = useCallback(() => {
    syncTimeToNow();
  }, [syncTimeToNow]);

  /* ---- Planning date picker (budući datum, lokalna ponoć kao sidro) ---- */
  const isPlanned = useMoonTransitStore((s) => s.timeAnchorIsPlanned);
  const setTimeAnchorPlanned = useMoonTransitStore((s) => s.setTimeAnchorPlanned);
  // Snapshot pri mountu — samo default za date-picker kad još nije planned, ne treba live-tick.
  const [mountNowMs] = useState(() => Date.now());
  const planningDateValue = useMemo(() => {
    const d = new Date(isPlanned ? timeAnchorMs : mountNowMs);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, [isPlanned, timeAnchorMs, mountNowMs]);
  const onPlanningDate = useCallback(
    (value: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!m) {
        return;
      }
      const anchor = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        0,
        0,
        0,
        0
      ).getTime();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      // Danas (ili prošlost) = povratak u live mode.
      if (anchor <= todayStart.getTime()) {
        syncTimeToNow();
        return;
      }
      setTimeAnchorPlanned(anchor);
    },
    [setTimeAnchorPlanned, syncTimeToNow]
  );

  /* ---- Best hours za planirani dan (čisti ephemeris) ---- */
  const bestHours = useMemo(
    () => (isPlanned ? computeBestTransitHours(obs, timeAnchorMs) : null),
    [isPlanned, obs, timeAnchorMs]
  );
  const onSelectPlanningHour = useCallback(
    (hourStartMs: number) => {
      setTimeOffsetMs(hourStartMs + 1_800_000 - timeAnchorMs);
    },
    [setTimeOffsetMs, timeAnchorMs]
  );

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
    liveFlightFeeds,
    setLiveFlightFeeds,
    providerFlightCounts,
    flightProvider,
    moon,
    isLoading,
    setSelectedFlightId,
    selectedFlightId,
    photoPack,
    photoShotFeasibility,
    photoUnavailableReason,
    beepOnTransit,
    setBeepOnTransit,
    alertsEnabled,
    setAlertsEnabled,
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
    isPlanned,
    planningDateValue,
    onPlanningDate,
    bestHours,
    onSelectPlanningHour,
    offsetHours,
    onSlider,
    showEphemeris,
    moonDisplay,
    candidatesDisplay,
    showEmptyCandidates,
    moonRise,
    moonSet,
    moonRiseSetKind,
    timeSliderStartLabel,
    timeSliderEndLabel,
    sliderWidthHours,
    timeSliderMode,
    isMoonBelowHorizon,
    cloudCoverPercent,
  };
}
