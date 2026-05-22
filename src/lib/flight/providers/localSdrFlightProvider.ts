import {
  flightsFromLocalSdrResponse,
  type LocalSdrResponse,
} from "@/lib/flight/localsdr/parseLocalSdrAircraft";
import { appPath } from "@/lib/paths/appPath";
import type { IFlightProvider } from "@/types/flight-provider";
import type { FlightQuery, FlightState } from "@/types/flight";

const CACHE_MS = 3_000;

type CacheEntry = {
  readonly at: number;
  readonly data: LocalSdrResponse;
};

/**
 * Local Raspberry Pi SDR receiver (dump1090 / readsb) via `/api/localsdr/aircraft`.
 * Configure `LOCAL_SDR_URL=http://<pi-ip>/data/aircraft.json` in `.env.local`.
 * Returns an empty list silently when the env var is not set.
 */
export class LocalSdrFlightProvider implements IFlightProvider {
  readonly id = "localsdr" as const;

  private cache: CacheEntry | null = null;
  private loadChain: Promise<readonly FlightState[]> = Promise.resolve([]);
  private fetchNotBeforeMs = 0;

  async getFlightsInBounds(q: FlightQuery): Promise<readonly FlightState[]> {
    const tail = async (): Promise<readonly FlightState[]> => {
      const now = Date.now();
      if (now < this.fetchNotBeforeMs) {
        return this.cache
          ? flightsFromLocalSdrResponse(this.cache.data, q.bounds)
          : [];
      }
      if (this.cache && now - this.cache.at < CACHE_MS) {
        return flightsFromLocalSdrResponse(this.cache.data, q.bounds);
      }
      const res = await fetch(appPath("/api/localsdr/aircraft"), {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status === 429) {
        this.fetchNotBeforeMs = Date.now() + 5_000;
        throw new Error("Local SDR: 429");
      }
      if (!res.ok) {
        throw new Error(`Local SDR: HTTP ${res.status}`);
      }
      const data: LocalSdrResponse = await res.json();
      this.cache = { at: Date.now(), data };
      return flightsFromLocalSdrResponse(data, q.bounds);
    };

    const next = this.loadChain.then(tail, tail);
    this.loadChain = next.catch((): readonly FlightState[] => []);
    return next;
  }
}
