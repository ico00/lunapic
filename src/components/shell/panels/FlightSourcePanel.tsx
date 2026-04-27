import { formatFixed, mpsToKnots } from "@/lib/format/numbers";
import { FlightProviderSelect } from "@/components/shell/FlightProviderSelect";
import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconFlightSource } from "@/components/shell/sectionCategoryIcons";
import { type FlightProviderId, type RouteCorridorStats } from "@/types/flight-provider";

type FlightSourcePanelProps = {
  flightProviderId: FlightProviderId;
  onFlightProviderIdChange: (id: FlightProviderId) => void;
  routeCorridor: RouteCorridorStats | null;
  isLoading: boolean;
};

export function FlightSourcePanel({
  flightProviderId,
  onFlightProviderIdChange,
  routeCorridor,
  isLoading,
}: FlightSourcePanelProps) {
  return (
    <ShellSectionCard
      title="Flight source"
      accent="sky"
      icon={<SectionIconFlightSource />}
    >
      <p className="text-xs leading-relaxed text-zinc-500">
        OpenSky: real ADS-B where the viewport intersects{" "}
        <code className="font-mono text-zinc-500">routes.json</code> flight
        corridors and the map. Static: simulated points along routes.
      </p>
      <label className="mt-2 block text-xs text-zinc-500">
        Provider
        <div className="mt-1 min-w-0">
          <FlightProviderSelect
            value={flightProviderId}
            onChange={onFlightProviderIdChange}
          />
        </div>
      </label>
      {flightProviderId === "opensky" && (
        <div className="mt-2 rounded-lg border border-sky-900/50 bg-sky-950/25 px-2 py-1.5 text-xs leading-relaxed text-sky-100/90">
          <p className="text-[0.65rem] text-sky-200/70">
            Heavy use hits OpenSky anonymous limits (429). A{" "}
            <span className="text-sky-100/90">free</span> OpenSky account in
            server <code className="font-mono text-sky-300/80">.env.local</code>{" "}
            (<code className="font-mono text-sky-300/80">OPENSKY_API_*</code>,
            see <code className="font-mono text-sky-300/80">.env.local.example</code>
            ) raises limits — no paid tier required for basic sign-up.
          </p>
          {routeCorridor && routeCorridor.sampleCount > 0 ? (
            <p>
              Average speed in the route region (map viewport; aircraft in the
              air with valid speed):{" "}
              <span className="font-mono tabular-nums">
                {formatFixed(routeCorridor.avgSpeedMps, 1)} m/s
              </span>{" "}
              (≈ {formatFixed(mpsToKnots(routeCorridor.avgSpeedMps), 0)} kn),{" "}
              <span className="font-mono tabular-nums">
                {routeCorridor.sampleCount}
              </span>{" "}
              samples.
            </p>
          ) : isLoading ? (
            <p className="text-zinc-500">Fetching OpenSky…</p>
          ) : (
            <p className="text-zinc-500">
              No samples in the visible region, or the map does not intersect
              the route corridor.
            </p>
          )}
        </div>
      )}
    </ShellSectionCard>
  );
}
