"use client";

import { CompassAimPanel } from "@/components/field/CompassAimPanel";
import { FieldOverlaysSection } from "@/components/field/FieldOverlaysSection";
import { AddToHomeScreenPrompt } from "@/components/shell/AddToHomeScreenPrompt";
import { GoldenAlignmentFlash } from "@/components/shell/GoldenAlignmentFlash";
import { ActiveTransitsPanel } from "@/components/shell/panels/ActiveTransitsPanel";
import { FlightSourcePanel } from "@/components/shell/panels/FlightSourcePanel";
import { MoonEphemerisPanel } from "@/components/shell/panels/MoonEphemerisPanel";
import { ObserverLocationPanel } from "@/components/shell/panels/ObserverLocationPanel";
import { PhotographerToolsPanel } from "@/components/shell/panels/PhotographerToolsPanel";
import { TimeSliderPanel } from "@/components/shell/panels/TimeSliderPanel";
import { TransitCandidatesPanel } from "@/components/shell/panels/TransitCandidatesPanel";
import { WeatherOverlay } from "@/components/weather/WeatherOverlay";
import { useHomeShellOrchestration } from "@/hooks/useHomeShellOrchestration";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { useTransitCandidateNotifications } from "@/hooks/useTransitCandidateNotifications";
import { useAstronomySync } from "@/hooks/useAstronomySync";
import { useWeatherSync } from "@/hooks/useWeatherSync";
import { resumeSharedAudioFromUserGesture } from "@/lib/audio/fieldAudio";
import { appPath } from "@/lib/paths/appPath";
import { useObserverStore } from "@/stores/observer-store";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * Lijevo: logo (ograničen max visinom/širinom — PNG može biti ogroman).
 * Desno: **LunaPic** (`mt-title`). `items-center` u retku.
 */
function AppHeaderBrand({ compact }: { compact: boolean }) {
  const imgClass = compact
    ? "h-auto max-h-14 w-auto max-w-[min(100%,9rem)] object-contain object-left sm:max-h-16"
    : "h-auto max-h-20 w-auto max-w-[min(100%,11rem)] object-contain object-left sm:max-h-24 md:max-h-[6.5rem] md:max-w-[min(100%,13rem)]";
  const wordClass = compact
    ? "mt-title shrink-0 text-balance text-xl leading-none tracking-tight sm:text-2xl"
    : "mt-title shrink-0 text-balance text-3xl leading-none tracking-tight sm:text-4xl md:text-5xl";

  return (
    <h1 className="m-0 flex w-full min-w-0 flex-nowrap flex-row items-center gap-2.5 p-0 sm:gap-3 md:gap-4">
      <div className="flex shrink-0 items-center">
        {/*
         * Native img + direct `appPath` (avoids `next/image` / some host issues).
         */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={appPath("/logo.png")}
          alt=""
          width={280}
          height={80}
          decoding="async"
          fetchPriority="high"
          className={imgClass}
        />
      </div>
      <span className={wordClass}>LunaPic</span>
    </h1>
  );
}

const MapContainer = dynamic(
  () =>
    import("@/components/map/MapContainer").then((m) => m.MapContainer),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="map-loading"
        className="mt-map-loading h-full min-h-[12rem] w-full"
        aria-label="Map loading"
      />
    ),
  }
);

/** Jedan tab = jedna `ShellSectionCard` na mobilnom donjem traku (~5 vidljivo, ostatak vodoravni scroll). */
type MobileShellPanelId =
  | "flight"
  | "observer"
  | "moon"
  | "candidates"
  | "active"
  | "time"
  | "photo"
  | "compass"
  | "field";

const MOBILE_BOTTOM_TABS: readonly {
  readonly id: MobileShellPanelId;
  readonly sheetTitle: string;
  readonly tabLabel: string;
}[] = [
  { id: "flight", sheetTitle: "Flight source", tabLabel: "Flight" },
  { id: "observer", sheetTitle: "Observer", tabLabel: "Observer" },
  { id: "moon", sheetTitle: "Moon (nowcast)", tabLabel: "Moon" },
  { id: "candidates", sheetTitle: "Transit candidates", tabLabel: "Tracks" },
  { id: "active", sheetTitle: "Active transits", tabLabel: "Active" },
  { id: "time", sheetTitle: "Time & weather", tabLabel: "Time" },
  { id: "photo", sheetTitle: "Photographer — tools", tabLabel: "Photo" },
  { id: "compass", sheetTitle: "Compass → Moon", tabLabel: "Compass" },
  {
    id: "field",
    sheetTitle: "Field: manual correction & export",
    tabLabel: "Field",
  },
];

type SheetSnap = "peek" | "half" | "full";

type ShellControls = {
  referenceEpochMs: number;
  offsetHours: number;
  onSlider: ReturnType<typeof useHomeShellOrchestration>["onSlider"];
  showEphemeris: boolean;
  isMoonBelowHorizon: boolean;
  sliderWidthHours: number;
  timeSliderStartLabel: string;
  timeSliderEndLabel: string;
  timeSliderMode: "forward24h";
  syncTime: () => void;
  observerLocationLocked: boolean;
  onPlaceObserverFromView: () => void;
  onFocusMapOnObserver: () => void;
};

function TimeAndWeatherBlock(props: ShellControls) {
  return (
    <div className="mt-chrome-bar px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 sm:pb-2 md:px-4 md:pb-2.5 md:pt-[max(0.625rem,env(safe-area-inset-top))]">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex w-max max-w-full min-w-0 flex-col items-stretch gap-2 self-start sm:shrink-0 sm:self-center">
          <div className="w-full pt-0.5 sm:pt-0">
            <WeatherOverlay />
          </div>
          <div
            className="pointer-events-auto flex w-full min-w-0 items-center justify-start gap-1"
            role="toolbar"
            aria-label="Map and time actions"
          >
            <button
              type="button"
              onClick={props.syncTime}
              className="mt-toolbar-btn mt-toolbar-btn-primary px-3 sm:px-2.5"
              title="Sync time to now"
              aria-label="Sync time to now"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-4 w-4"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={props.onPlaceObserverFromView}
              disabled={props.observerLocationLocked}
              className="mt-toolbar-btn w-9 text-yellow-400/90 hover:border-blue-500/35"
              title="Set my location here"
              aria-label="Set my location here — current view center becomes observer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-4 w-4"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={props.onFocusMapOnObserver}
              className="mt-toolbar-btn w-9 hover:border-blue-500/35"
              title="Focus on me"
              aria-label="Focus on me — pan map to observer, does not move the point"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-4 w-4"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                />
              </svg>
            </button>
            <Link
              href="/about"
              className="mt-toolbar-btn px-3 font-[family-name:var(--font-jetbrains-mono)] text-xs font-medium text-zinc-200 hover:border-blue-500/35"
              title="About and usage guide"
              aria-label="Open about and usage guide page"
            >
              About
            </Link>
          </div>
        </div>
        <div className="pointer-events-auto flex max-h-44 min-h-0 min-w-0 flex-1 flex-col self-start sm:max-h-52 sm:self-center md:max-h-56">
          <TimeSliderPanel
            variant="mapChip"
            className="h-full min-h-0 flex flex-col"
            referenceEpochMs={props.referenceEpochMs}
            offsetHours={props.offsetHours}
            onOffsetHoursChange={props.onSlider}
            showEphemeris={props.showEphemeris}
            isMoonBelowHorizon={props.isMoonBelowHorizon}
            sliderMaxHours={props.sliderWidthHours}
            timeSliderStartLabel={props.timeSliderStartLabel}
            timeSliderEndLabel={props.timeSliderEndLabel}
            timeSliderMode={props.timeSliderMode}
          />
        </div>
      </div>
    </div>
  );
}

export function HomePageClient() {
  const s = useHomeShellOrchestration();
  const isWide = useIsMdUp();
  const [mobilePanelId, setMobilePanelId] = useState<MobileShellPanelId | null>(
    null
  );
  const [pulsePanelId, setPulsePanelId] = useState<MobileShellPanelId | null>(
    null
  );
  const mobileTabBtnRefs = useRef<
    Partial<Record<MobileShellPanelId, HTMLButtonElement | null>>
  >({});
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const [sheetDragOffsetPx, setSheetDragOffsetPx] = useState(0);
  const touchStartYRef = useRef<number | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null
  );
  const requestPlaceObserverFromView = useObserverStore(
    (st) => st.requestPlaceObserverFromView
  );
  const requestFocusOnObserver = useObserverStore(
    (st) => st.requestFocusOnObserver
  );
  const observerLocationLocked = useObserverStore(
    (st) => st.observerLocationLocked
  );
  useWeatherSync();
  useAstronomySync();

  const timeBlockProps: ShellControls = {
    referenceEpochMs: s.referenceEpochMs,
    offsetHours: s.offsetHours,
    onSlider: s.onSlider,
    showEphemeris: s.showEphemeris,
    isMoonBelowHorizon: s.isMoonBelowHorizon,
    sliderWidthHours: s.sliderWidthHours,
    timeSliderStartLabel: s.timeSliderStartLabel,
    timeSliderEndLabel: s.timeSliderEndLabel,
    timeSliderMode: s.timeSliderMode,
    syncTime: () => {
      resumeSharedAudioFromUserGesture();
      s.syncTime();
    },
    observerLocationLocked,
    onPlaceObserverFromView: requestPlaceObserverFromView,
    onFocusMapOnObserver: requestFocusOnObserver,
  };

  const mobileSheetTitle = useMemo(() => {
    if (!mobilePanelId) {
      return "";
    }
    return (
      MOBILE_BOTTOM_TABS.find((t) => t.id === mobilePanelId)?.sheetTitle ?? ""
    );
  }, [mobilePanelId]);

  useLayoutEffect(() => {
    if (!mobilePanelId) {
      return;
    }
    const el = mobileTabBtnRefs.current[mobilePanelId];
    el?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [mobilePanelId]);
  const candidateNotifications = useTransitCandidateNotifications({
    candidates: s.candidatesDisplay,
    activeTransits: s.activeTransits,
  });
  const sheetHeightClass = useMemo(() => {
    if (sheetSnap === "full") return "h-[76dvh]";
    if (sheetSnap === "half") return "h-[58dvh]";
    return "h-[42dvh]";
  }, [sheetSnap]);

  const openMobilePanel = useCallback((panel: MobileShellPanelId) => {
    let next: MobileShellPanelId | null = null;
    setMobilePanelId((prev) => {
      next = prev === panel ? null : panel;
      return next;
    });
    if (pulseTimeoutRef.current !== null) {
      globalThis.clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = null;
    }
    if (next) {
      setPulsePanelId(next);
      pulseTimeoutRef.current = globalThis.setTimeout(() => {
        setPulsePanelId((current) => (current === next ? null : current));
        pulseTimeoutRef.current = null;
      }, 260);
    } else {
      setPulsePanelId(null);
    }
    setSheetSnap("peek");
    setSheetDragOffsetPx(0);
  }, []);

  const handleSheetTouchStart = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
      setSheetDragOffsetPx(0);
    },
    []
  );

  const handleSheetTouchMove = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      if (touchStartYRef.current === null) return;
      const currentY = event.touches[0]?.clientY ?? touchStartYRef.current;
      setSheetDragOffsetPx(currentY - touchStartYRef.current);
    },
    []
  );

  const handleSheetTouchEnd = useCallback(() => {
    const delta = sheetDragOffsetPx;
    if (delta > 120) {
      if (sheetSnap === "peek") {
        setMobilePanelId(null);
      } else if (sheetSnap === "half") {
        setSheetSnap("peek");
      } else {
        setSheetSnap("half");
      }
    } else if (delta > 65) {
      if (sheetSnap === "full") {
        setSheetSnap("half");
      } else if (sheetSnap === "half") {
        setSheetSnap("peek");
      }
    } else if (delta < -90) {
      if (sheetSnap === "peek") {
        setSheetSnap("half");
      } else if (sheetSnap === "half") {
        setSheetSnap("full");
      }
    }
    touchStartYRef.current = null;
    setSheetDragOffsetPx(0);
  }, [sheetDragOffsetPx, sheetSnap]);

  const missionPanels = (
    <>
      <FlightSourcePanel
        flightProviderId={s.flightProviderId}
        liveFlightFeeds={s.liveFlightFeeds}
        onLiveFlightFeedsChange={s.setLiveFlightFeeds}
      />
      <ObserverLocationPanel
        observer={s.obs}
        onUseGps={s.onUseGps}
        gpsBusy={s.gpsBusy}
        gpsError={s.gpsError}
        locationActionsDisabled={s.observerLocationLocked}
      />
      <MoonEphemerisPanel
        moon={s.moon}
        observer={s.obs}
        display={s.moonDisplay}
        moonRise={s.moonRise}
        moonSet={s.moonSet}
        moonRiseSetKind={s.moonRiseSetKind}
        showEphemeris={s.showEphemeris}
        isMoonBelowHorizon={s.isMoonBelowHorizon}
        snapshotContext={{
          referenceEpochMs: s.referenceEpochMs,
          observerLat: s.obs.lat,
          observerLng: s.obs.lng,
          observerGroundHeightMeters: s.obs.groundHeightMeters,
        }}
      />
      <TransitCandidatesPanel
        candidates={s.candidatesDisplay}
        isLoading={s.isLoading}
        error={s.error}
        showEmpty={s.showEmptyCandidates}
        showEphemeris={s.showEphemeris}
        selectedFlightId={s.selectedFlightId}
        notificationsSupported={candidateNotifications.notificationsSupported}
        notificationPermission={candidateNotifications.permission}
        watchedFlightIds={candidateNotifications.watchedFlightIds}
        onSelectFlight={s.setSelectedFlightId}
        onToggleWatchFlight={candidateNotifications.toggleWatchForFlight}
      />
      <ActiveTransitsPanel
        rows={s.activeTransits}
        showEphemeris={s.showEphemeris}
        selectedFlightId={s.selectedFlightId}
        onSelectFlight={s.setSelectedFlightId}
      />
    </>
  );

  const fieldPanels = (
    <>
      <PhotographerToolsPanel
        selectedFlightId={s.selectedFlightId}
        photoPack={s.photoPack}
        photoShotFeasibility={s.photoShotFeasibility}
        photoUnavailableReason={s.photoUnavailableReason}
        beepOnTransit={s.beepOnTransit}
        onToggleBeep={() => {
          s.setBeepOnTransit((b) => !b);
        }}
      />
      <CompassAimPanel />
      <FieldOverlaysSection />
    </>
  );

  return (
    <div
      className="mt-app-root relative flex h-dvh min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden"
    >
      <GoldenAlignmentFlash
        token={s.goldenFlashToken}
        onAnimationEnd={() => {
          s.setGoldenFlashToken(null);
        }}
      />
      <AddToHomeScreenPrompt />
      {isWide ? (
        <div className="grid min-h-0 min-w-0 flex-1 auto-rows-[auto_minmax(0,1fr)] grid-cols-1 md:grid-cols-[20rem_minmax(0,1fr)_20rem]">
          <header className="mt-chrome-bar flex w-full min-w-0 shrink-0 items-center overflow-hidden px-4 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] md:col-start-1 md:row-start-1 md:self-center">
            <AppHeaderBrand compact={false} />
          </header>
          <div className="min-h-0 shrink-0 md:col-span-2 md:col-start-2 md:row-start-1 md:self-stretch">
            <TimeAndWeatherBlock {...timeBlockProps} />
          </div>
          <aside className="mt-side-rail min-h-0 min-w-0 overflow-y-auto border-r px-4 pb-4 pt-0 text-zinc-200 [scrollbar-gutter:stable] md:col-start-1 md:row-start-2">
            {missionPanels}
          </aside>
          <div className="relative min-h-0 min-w-0 overflow-hidden shadow-[0_0_0_1px_rgba(63,63,70,0.5),0_24px_80px_-20px_rgba(0,0,0,0.55)] md:col-start-2 md:row-start-2 md:rounded-md">
            <MapContainer
              flightProvider={s.flightProvider}
              isGolden={s.isGolden}
              fieldSoundsEnabled={s.beepOnTransit}
            />
          </div>
          <aside className="mt-side-rail min-h-0 min-w-0 overflow-y-auto border-l px-4 pb-4 pt-0 text-zinc-200 [scrollbar-gutter:stable] md:col-start-3 md:row-start-2">
            {fieldPanels}
          </aside>
        </div>
      ) : (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-black">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-2.5 pt-[max(0.4rem,env(safe-area-inset-top))]">
            <div className="pointer-events-auto inline-flex max-w-[min(76vw,14rem)] items-center rounded-md border border-zinc-700 bg-zinc-950/90 px-2.5 py-1.5 shadow-lg shadow-black/40 backdrop-blur-xl">
              <AppHeaderBrand compact />
            </div>
          </div>
          <div className="relative min-h-0 w-full min-w-0 flex-1 touch-pan-x touch-pan-y pb-[max(4.5rem,calc(3.6rem+env(safe-area-inset-bottom)))]">
            <MapContainer
              flightProvider={s.flightProvider}
              isGolden={s.isGolden}
              fieldSoundsEnabled={s.beepOnTransit}
            />
          </div>
          {mobilePanelId ? (
            <section
              className={`absolute inset-x-0 bottom-[calc(3.35rem+env(safe-area-inset-bottom))] z-50 max-h-[78dvh] min-h-[42dvh] overflow-hidden rounded-t-lg border border-zinc-800 bg-zinc-950/98 shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-[height,transform,box-shadow] duration-300 motion-reduce:transition-none ${sheetHeightClass}`}
              aria-label={`${mobileSheetTitle} controls`}
              aria-labelledby={`mobile-shell-tab-${mobilePanelId}`}
              style={{
                transform: `translateY(${Math.max(0, sheetDragOffsetPx)}px)`,
                transitionTimingFunction: "cubic-bezier(0.2, 0.9, 0.2, 1.06)",
              }}
            >
              <header
                className="flex items-center justify-between border-b border-white/10 px-4 py-2.5"
                onTouchStart={handleSheetTouchStart}
                onTouchMove={handleSheetTouchMove}
                onTouchEnd={handleSheetTouchEnd}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSheetSnap((prev) =>
                      prev === "peek" ? "half" : prev === "half" ? "full" : "peek"
                    );
                  }}
                  className="absolute left-1/2 top-1.5 h-1.5 w-12 -translate-x-1/2 rounded-full bg-zinc-600 transition-transform duration-150 active:scale-x-110 active:scale-y-125 motion-reduce:transition-none"
                  aria-label="Adjust panel height"
                  title="Adjust panel height"
                />
                <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
                  {mobileSheetTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setMobilePanelId(null);
                  }}
                  className="rounded-md border border-white/12 bg-[#121212] px-2 py-1 font-[family-name:var(--font-jetbrains-mono)] text-xs text-zinc-300"
                  aria-label="Close controls"
                >
                  Close
                </button>
              </header>
              <div
                id="mobile-shell-sheet-panel"
                role="tabpanel"
                className="h-[calc(100%-3rem)] overflow-y-auto px-3 py-2 text-zinc-200 [scrollbar-gutter:stable]"
              >
                {mobilePanelId === "flight" ? (
                  <FlightSourcePanel
                    flightProviderId={s.flightProviderId}
                    liveFlightFeeds={s.liveFlightFeeds}
                    onLiveFlightFeedsChange={s.setLiveFlightFeeds}
                  />
                ) : null}
                {mobilePanelId === "observer" ? (
                  <div className="space-y-3">
                    <ObserverLocationPanel
                      observer={s.obs}
                      onUseGps={s.onUseGps}
                      gpsBusy={s.gpsBusy}
                      gpsError={s.gpsError}
                      locationActionsDisabled={s.observerLocationLocked}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={requestPlaceObserverFromView}
                        disabled={observerLocationLocked}
                        className="rounded-md border border-blue-500/35 bg-blue-500/08 px-2.5 py-2.5 font-[family-name:var(--font-jetbrains-mono)] text-xs font-medium text-yellow-400/90 disabled:opacity-40"
                      >
                        Set my location here
                      </button>
                      <button
                        type="button"
                        onClick={requestFocusOnObserver}
                        className="rounded-md border border-white/15 bg-[#121212] px-2.5 py-2.5 font-[family-name:var(--font-jetbrains-mono)] text-xs font-medium text-zinc-200"
                      >
                        Focus on me
                      </button>
                    </div>
                  </div>
                ) : null}
                {mobilePanelId === "moon" ? (
                  <MoonEphemerisPanel
                    moon={s.moon}
                    observer={s.obs}
                    display={s.moonDisplay}
                    moonRise={s.moonRise}
                    moonSet={s.moonSet}
                    moonRiseSetKind={s.moonRiseSetKind}
                    showEphemeris={s.showEphemeris}
                    isMoonBelowHorizon={s.isMoonBelowHorizon}
                    snapshotContext={{
                      referenceEpochMs: s.referenceEpochMs,
                      observerLat: s.obs.lat,
                      observerLng: s.obs.lng,
                      observerGroundHeightMeters: s.obs.groundHeightMeters,
                    }}
                  />
                ) : null}
                {mobilePanelId === "candidates" ? (
                  <TransitCandidatesPanel
                    candidates={s.candidatesDisplay}
                    isLoading={s.isLoading}
                    error={s.error}
                    showEmpty={s.showEmptyCandidates}
                    showEphemeris={s.showEphemeris}
                    selectedFlightId={s.selectedFlightId}
                    notificationsSupported={
                      candidateNotifications.notificationsSupported
                    }
                    notificationPermission={candidateNotifications.permission}
                    watchedFlightIds={candidateNotifications.watchedFlightIds}
                    onSelectFlight={s.setSelectedFlightId}
                    onToggleWatchFlight={
                      candidateNotifications.toggleWatchForFlight
                    }
                  />
                ) : null}
                {mobilePanelId === "active" ? (
                  <ActiveTransitsPanel
                    rows={s.activeTransits}
                    showEphemeris={s.showEphemeris}
                    selectedFlightId={s.selectedFlightId}
                    onSelectFlight={s.setSelectedFlightId}
                  />
                ) : null}
                {mobilePanelId === "time" ? (
                  <div className="space-y-3">
                    <div className="rounded-md border border-white/10 bg-[#121212]/90 px-2.5 py-2">
                      <WeatherOverlay />
                    </div>
                    <TimeSliderPanel
                      variant="panel"
                      referenceEpochMs={s.referenceEpochMs}
                      offsetHours={s.offsetHours}
                      onOffsetHoursChange={s.onSlider}
                      showEphemeris={s.showEphemeris}
                      isMoonBelowHorizon={s.isMoonBelowHorizon}
                      sliderMaxHours={s.sliderWidthHours}
                      timeSliderStartLabel={s.timeSliderStartLabel}
                      timeSliderEndLabel={s.timeSliderEndLabel}
                      timeSliderMode={s.timeSliderMode}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        resumeSharedAudioFromUserGesture();
                        s.syncTime();
                      }}
                      className="w-full rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2.5 font-[family-name:var(--font-jetbrains-mono)] text-sm font-semibold text-yellow-400"
                    >
                      Sync time to now
                    </button>
                  </div>
                ) : null}
                {mobilePanelId === "photo" ? (
                  <PhotographerToolsPanel
                    selectedFlightId={s.selectedFlightId}
                    photoPack={s.photoPack}
                    photoShotFeasibility={s.photoShotFeasibility}
                    photoUnavailableReason={s.photoUnavailableReason}
                    beepOnTransit={s.beepOnTransit}
                    onToggleBeep={() => {
                      s.setBeepOnTransit((b) => !b);
                    }}
                  />
                ) : null}
                {mobilePanelId === "compass" ? <CompassAimPanel /> : null}
                {mobilePanelId === "field" ? <FieldOverlaysSection /> : null}
              </div>
            </section>
          ) : null}
          <nav
            className="absolute inset-x-0 bottom-0 z-[60] border-t border-zinc-800 bg-black/92 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-2xl"
            aria-label="Primary mobile navigation"
          >
            <div
              className="flex w-full snap-x snap-mandatory gap-1.5 overflow-x-auto px-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
            >
              {MOBILE_BOTTOM_TABS.map((t) => {
                const selected = mobilePanelId === t.id;
                return (
                  <button
                    key={t.id}
                    id={`mobile-shell-tab-${t.id}`}
                    type="button"
                    ref={(el) => {
                      mobileTabBtnRefs.current[t.id] = el;
                    }}
                    role="tab"
                    aria-selected={selected}
                    aria-controls="mobile-shell-sheet-panel"
                    data-testid={`mobile-shell-tab-${t.id}`}
                    onClick={() => {
                      openMobilePanel(t.id);
                    }}
                    className={`flex min-h-11 min-w-[calc((100vw-2.25rem)/5)] max-w-[6.25rem] shrink-0 snap-start flex-col items-center justify-center rounded-lg px-1.5 py-1 text-center text-[0.65rem] font-semibold leading-tight transition duration-150 active:scale-[0.97] motion-reduce:transition-none sm:min-w-[4.25rem] ${
                      selected
                        ? "bg-zinc-900 text-zinc-50 ring-1 ring-blue-500/45"
                        : "text-zinc-400 hover:bg-zinc-800/55 hover:text-zinc-200"
                    } ${pulsePanelId === t.id ? "scale-[1.03]" : ""}`}
                  >
                    {t.tabLabel}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
