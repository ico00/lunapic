import { FlightProviderSelect } from "@/components/shell/FlightProviderSelect";
import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconFlightSource } from "@/components/shell/sectionCategoryIcons";
import type { LiveFlightFeeds } from "@/stores/moon-transit-store";
import { type FlightProviderId } from "@/types/flight-provider";

type FlightSourcePanelProps = {
  flightProviderId: FlightProviderId;
  liveFlightFeeds: LiveFlightFeeds;
  onLiveFlightFeedsChange: (patch: Partial<LiveFlightFeeds>) => void;
};

export function FlightSourcePanel({
  flightProviderId,
  liveFlightFeeds,
  onLiveFlightFeedsChange,
}: FlightSourcePanelProps) {
  return (
    <ShellSectionCard
      title="Flight source"
      accent="sky"
      icon={<SectionIconFlightSource />}
    >
      <label className="block text-xs text-zinc-500">
        Provider
        <div className="mt-1 min-w-0">
          <FlightProviderSelect
            value={flightProviderId}
            liveFlightFeeds={liveFlightFeeds}
            onLiveFlightFeedsChange={onLiveFlightFeedsChange}
          />
        </div>
      </label>
    </ShellSectionCard>
  );
}
