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
import { useWeatherSync } from "@/hooks/useWeatherSync";
import { useAstronomySync } from "@/hooks/useAstronomySync";
import dynamic from "next/dynamic";

const MapContainer = dynamic(
  () =>
    import("@/components/map/MapContainer").then((m) => m.MapContainer),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="map-loading"
        className="h-full w-full bg-zinc-900"
        aria-label="Map loading"
      />
    ),
  }
);

export function HomePageClient() {
  const s = useHomeShellOrchestration();
  useWeatherSync();
  useAstronomySync();

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <GoldenAlignmentFlash
        token={s.goldenFlashToken}
        onAnimationEnd={() => {
          s.setGoldenFlashToken(null);
        }}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[20rem_minmax(0,1fr)_20rem] md:grid-rows-[auto_minmax(0,1fr)]">
        <header className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-3 py-2 md:col-start-1 md:row-start-1 md:px-4 md:py-2.5">
          <h1 className="text-base font-semibold tracking-tight text-zinc-100 md:text-lg">
            Moon Transit
          </h1>
          <p className="text-xs text-zinc-500 md:text-sm">
            Moon, aircraft, and crossing angle
          </p>
        </header>
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-3 py-2 md:col-span-2 md:col-start-2 md:row-start-1 md:px-4 md:py-2.5">
          <div className="flex min-w-0 flex-wrap items-stretch gap-2">
            <WeatherOverlay />
            <div className="pointer-events-auto min-h-0 min-w-0 flex-1 basis-[min(100%,31rem)] self-stretch">
              <TimeSliderPanel
                variant="mapChip"
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
            </div>
            <button
              type="button"
              onClick={s.syncTime}
              className="pointer-events-auto flex shrink-0 items-center justify-center self-stretch rounded-lg border border-zinc-800/70 bg-zinc-950/70 px-2.5 shadow-md backdrop-blur-sm transition hover:border-zinc-600 hover:bg-zinc-900/80"
              title="Sync time to now"
              aria-label="Sync time to now"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-4 w-4 text-amber-400/85"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </button>
          </div>
        </div>
        <aside className="max-h-[40vh] min-h-0 shrink-0 overflow-y-auto border-b border-zinc-800 bg-zinc-950/95 p-4 text-zinc-200 md:col-start-1 md:row-start-2 md:max-h-none md:border-b-0 md:border-r">
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
            onFocusMapOnObserver={() => {
              s.requestFocusOnObserver();
            }}
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
        </aside>
        <div className="relative min-h-0 min-w-0 md:col-start-2 md:row-start-2">
          <MapContainer flightProvider={s.flightProvider} isGolden={s.isGolden} />
        </div>
        <aside className="max-h-[40vh] min-h-0 shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-950/95 p-4 text-zinc-200 md:col-start-3 md:row-start-2 md:max-h-none md:border-t-0 md:border-l">
          <PhotographerToolsPanel
            selectedFlightId={s.selectedFlightId}
            photoPack={s.photoPack}
            beepOnTransit={s.beepOnTransit}
            onToggleBeep={() => {
              s.setBeepOnTransit((b) => !b);
            }}
          />
          <div className="mt-5 min-w-0 space-y-4">
            <CompassAimPanel />
            <FieldOverlaysSection />
          </div>
        </aside>
      </div>
    </div>
  );
}
