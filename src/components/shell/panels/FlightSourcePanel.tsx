import { FlightProviderSelect } from "@/components/shell/FlightProviderSelect";
import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconFlightSource } from "@/components/shell/sectionCategoryIcons";
import { type FlightProviderId } from "@/types/flight-provider";

type FlightSourcePanelProps = {
  flightProviderId: FlightProviderId;
  onFlightProviderIdChange: (id: FlightProviderId) => void;
};

export function FlightSourcePanel({
  flightProviderId,
  onFlightProviderIdChange,
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
            onChange={onFlightProviderIdChange}
          />
        </div>
      </label>
    </ShellSectionCard>
  );
}
