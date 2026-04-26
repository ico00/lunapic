import type { IFlightProvider } from "@/types";
import type { FlightProviderId } from "@/types/flight-provider";
import { FLIGHT_PROVIDER_IDS } from "@/types/flight-provider";
import { MockFlightProvider } from "./providers/mockFlightProvider";
import { OpenSkyFlightProvider } from "./providers/openSkyFlightProvider";
import { StaticFlightProvider } from "./providers/staticFlightProvider";

const instances = new Map<FlightProviderId, IFlightProvider>();

const factories = {
  mock: (): IFlightProvider => new MockFlightProvider(),
  static: (): IFlightProvider => new StaticFlightProvider(),
  opensky: (): IFlightProvider => new OpenSkyFlightProvider(),
} as const;

/**
 * Jedan primjerak po id-ju (predmemorija i zadnje OpenSky statistike).
 */
export function getFlightProvider(id: FlightProviderId): IFlightProvider {
  const x = instances.get(id);
  if (x) {
    return x;
  }
  const c = factories[id]();
  instances.set(id, c);
  return c;
}

export { FLIGHT_PROVIDER_IDS };
