import { formatFixed, mpsToKnots } from "@/lib/format/numbers";
import {
  FLIGHT_PROVIDER_IDS,
  type FlightProviderId,
  type RouteCorridorStats,
} from "@/types/flight-provider";

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
    <>
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Flight source
      </h2>
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
        OpenSky: real ADS-B where the viewport intersects{" "}
        <code className="font-mono text-zinc-500">routes.json</code> flight
        corridors and the map. Static: simulated points along routes.
      </p>
      <label className="mt-2 block text-xs text-zinc-500">
        Provider
        <select
          data-testid="flight-provider-select"
          aria-label="Flight data provider"
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-sm text-zinc-200"
          value={flightProviderId}
          onChange={(e) =>
            onFlightProviderIdChange(e.target.value as FlightProviderId)
          }
        >
          {FLIGHT_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {id === "mock"
                ? "Mock"
                : id === "static"
                  ? "Routes (static)"
                  : "OpenSky (ADS-B)"}
            </option>
          ))}
        </select>
      </label>
      {flightProviderId === "opensky" && (
        <div className="mt-2 rounded border border-sky-900/50 bg-sky-950/25 px-2 py-1.5 text-xs leading-relaxed text-sky-100/90">
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
    </>
  );
}
