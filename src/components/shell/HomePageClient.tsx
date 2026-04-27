"use client";

import { CompassAimPanel } from "@/components/field/CompassAimPanel";
import { FieldOverlaysSection } from "@/components/field/FieldOverlaysSection";
import { GoldenAlignmentFlash } from "@/components/shell/GoldenAlignmentFlash";
import { ActiveTransitsPanel } from "@/components/shell/panels/ActiveTransitsPanel";
import { FlightSourcePanel } from "@/components/shell/panels/FlightSourcePanel";
import { MoonEphemerisPanel } from "@/components/shell/panels/MoonEphemerisPanel";
import { ObserverLocationPanel } from "@/components/shell/panels/ObserverLocationPanel";
import { PhotographerToolsPanel } from "@/components/shell/panels/PhotographerToolsPanel";
import { SidebarSyncFooter } from "@/components/shell/panels/SidebarSyncFooter";
import { TimeSliderPanel } from "@/components/shell/panels/TimeSliderPanel";
import { TransitCandidatesPanel } from "@/components/shell/panels/TransitCandidatesPanel";
import { WeatherOverlay } from "@/components/weather/WeatherOverlay";
import { useHomeShellOrchestration } from "@/hooks/useHomeShellOrchestration";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { useAstronomySync } from "@/hooks/useAstronomySync";
import { useWeatherSync } from "@/hooks/useWeatherSync";
import { appPath } from "@/lib/paths/appPath";
import { useObserverStore } from "@/stores/observer-store";
import dynamic from "next/dynamic";
import { useState } from "react";

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

type MobileTab = "mission" | "field";

type ShellControls = {
  referenceEpochMs: number;
  offsetHours: number;
  onSlider: ReturnType<typeof useHomeShellOrchestration>["onSlider"];
  showEphemeris: boolean;
  isMoonBelowHorizon: boolean;
  sliderWidthHours: number;
  timeSliderStartLabel: string;
  timeSliderEndLabel: string;
  timeSliderMode: "moonriseToSet" | "fallback";
  syncTime: () => void;
  observerLocationLocked: boolean;
  onPlaceObserverFromView: () => void;
  onFocusMapOnObserver: () => void;
};

function TimeAndWeatherBlock(props: ShellControls) {
  return (
    <div className="mt-chrome-bar px-3 py-2 sm:px-4 md:py-2.5">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex w-max max-w-full min-w-0 flex-col items-stretch gap-2 self-start sm:shrink-0">
          <div className="w-full pt-0.5">
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
              className="mt-toolbar-btn w-9 text-amber-200/90 hover:border-amber-500/35"
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
              className="mt-toolbar-btn w-9 hover:border-sky-400/40"
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
          </div>
        </div>
        <div className="pointer-events-auto flex max-h-44 min-h-0 min-w-0 flex-1 flex-col self-start sm:max-h-52 md:max-h-56">
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
  const [mobileTab, setMobileTab] = useState<MobileTab>("mission");
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
    syncTime: s.syncTime,
    observerLocationLocked,
    onPlaceObserverFromView: requestPlaceObserverFromView,
    onFocusMapOnObserver: requestFocusOnObserver,
  };

  const missionPanels = (
    <>
      <FlightSourcePanel
        flightProviderId={s.flightProviderId}
        onFlightProviderIdChange={s.setFlightProvider}
        routeCorridor={s.routeCorridor}
        isLoading={s.isLoading}
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
        display={s.moonDisplay}
        moonRise={s.moonRise}
        moonSet={s.moonSet}
        moonRiseSetKind={s.moonRiseSetKind}
        showEphemeris={s.showEphemeris}
        isMoonBelowHorizon={s.isMoonBelowHorizon}
      />
      <TransitCandidatesPanel
        candidates={s.candidatesDisplay}
        isLoading={s.isLoading}
        error={s.error}
        showEmpty={s.showEmptyCandidates}
        showEphemeris={s.showEphemeris}
        selectedFlightId={s.selectedFlightId}
        onSelectFlight={s.setSelectedFlightId}
      />
      <ActiveTransitsPanel
        rows={s.activeTransits}
        showEphemeris={s.showEphemeris}
        selectedFlightId={s.selectedFlightId}
        onSelectFlight={s.setSelectedFlightId}
      />
      <SidebarSyncFooter />
    </>
  );

  const fieldPanels = (
    <>
      <PhotographerToolsPanel
        selectedFlightId={s.selectedFlightId}
        photoPack={s.photoPack}
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
      {isWide ? (
        <div className="grid min-h-0 min-w-0 flex-1 auto-rows-[auto_minmax(0,1fr)] grid-cols-1 md:grid-cols-[20rem_minmax(0,1fr)_20rem]">
          <header className="mt-chrome-bar w-full min-w-0 shrink-0 self-start overflow-hidden px-4 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[0_1px_0_0_rgba(0,0,0,0.35)] md:col-start-1 md:row-start-1">
            <AppHeaderBrand compact={false} />
          </header>
          <div className="shrink-0 md:col-span-2 md:col-start-2 md:row-start-1">
            <TimeAndWeatherBlock {...timeBlockProps} />
          </div>
          <aside className="mt-side-rail min-h-0 min-w-0 overflow-y-auto border-r p-4 text-zinc-200 [scrollbar-gutter:stable] md:col-start-1 md:row-start-2">
            {missionPanels}
          </aside>
          <div className="relative min-h-0 min-w-0 overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_80px_-20px_rgba(0,0,0,0.55)] md:col-start-2 md:row-start-2 md:rounded-2xl">
            <MapContainer
              flightProvider={s.flightProvider}
              isGolden={s.isGolden}
            />
          </div>
          <aside className="mt-side-rail min-h-0 min-w-0 overflow-y-auto border-l p-4 text-zinc-200 [scrollbar-gutter:stable] md:col-start-3 md:row-start-2">
            {fieldPanels}
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="mt-chrome-bar w-full min-w-0 shrink-0 self-start overflow-hidden px-3 py-1.5 pt-[max(0.35rem,env(safe-area-inset-top))]">
            <div className="flex w-full min-w-0 flex-nowrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <AppHeaderBrand compact />
              </div>
              <span className="hidden text-[0.6rem] font-medium uppercase tracking-[0.2em] text-zinc-600 sm:inline">
                field ops
              </span>
            </div>
          </header>
          <TimeAndWeatherBlock {...timeBlockProps} />
          <div className="relative min-h-0 w-full min-w-0 flex-1 touch-pan-x touch-pan-y">
            <MapContainer
              flightProvider={s.flightProvider}
              isGolden={s.isGolden}
            />
          </div>
          <div
            className="grid min-h-0 max-h-[min(42dvh,22rem)] shrink-0 grid-rows-[auto_minmax(0,1fr)] border-t border-white/10 bg-zinc-950/90 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_-4px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-2xl"
            data-testid="mobile-control-deck"
          >
            <div
              className="flex gap-1 p-1.5"
              role="tablist"
              aria-label="Control sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === "mission"}
                onClick={() => {
                  setMobileTab("mission");
                }}
                className={`flex-1 rounded-xl px-2 py-2 text-center text-sm font-medium transition duration-200 ${
                  mobileTab === "mission"
                    ? "bg-gradient-to-b from-zinc-700/90 to-zinc-800/95 text-zinc-50 shadow-lg shadow-black/30 ring-1 ring-emerald-500/50"
                    : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                Map & transits
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === "field"}
                onClick={() => {
                  setMobileTab("field");
                }}
                className={`flex-1 rounded-xl px-2 py-2 text-center text-sm font-medium transition duration-200 ${
                  mobileTab === "field"
                    ? "bg-gradient-to-b from-zinc-700/90 to-zinc-800/95 text-zinc-50 shadow-lg shadow-black/30 ring-1 ring-sky-500/50"
                    : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                Photo & field
              </button>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-2 text-zinc-200 [scrollbar-gutter:stable]"
              data-testid="mobile-deck-content"
            >
              {mobileTab === "mission" ? missionPanels : fieldPanels}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
