import { FlightProviderSelect } from "@/components/shell/FlightProviderSelect";
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
    <label className="block text-[length:var(--fs-meta)] font-medium text-[color:var(--t-secondary)]">
      Provider
      <div className="mt-1.5 min-w-0">
        <FlightProviderSelect
          value={flightProviderId}
          liveFlightFeeds={liveFlightFeeds}
          onLiveFlightFeedsChange={onLiveFlightFeedsChange}
        />
      </div>
    </label>
  );
}
