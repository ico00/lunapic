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
import { useHomeShellOrchestration } from "@/hooks/useHomeShellOrchestration";
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

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col md:flex-row">
      <GoldenAlignmentFlash
        token={s.goldenFlashToken}
        onAnimationEnd={() => {
          s.setGoldenFlashToken(null);
        }}
      />
      <aside className="w-full max-h-[40vh] shrink-0 overflow-y-auto border-b border-zinc-800 bg-zinc-950/95 p-4 text-zinc-200 md:max-h-none md:w-80 md:border-b-0 md:border-r">
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
        <MoonEphemerisPanel moon={s.moon} display={s.moonDisplay} />
        <TimeSliderPanel
          referenceEpochMs={s.referenceEpochMs}
          offsetHours={s.offsetHours}
          onOffsetHoursChange={s.onSlider}
          showEphemeris={s.showEphemeris}
          nearestWindowLabel={s.nearestWindow.label}
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
          <FieldOverlaysSection photoShutter={s.photoPack?.shutterText ?? null} />
        </div>
        <SidebarSyncFooter onSyncTime={s.syncTime} />
      </aside>
      <div className="relative min-h-0 min-w-0 flex-1">
        <MapContainer flightProvider={s.flightProvider} isGolden={s.isGolden} />
      </div>
    </div>
  );
}
