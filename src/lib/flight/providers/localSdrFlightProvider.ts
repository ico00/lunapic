import {
  flightsFromLocalSdrResponse,
  type LocalSdrResponse,
} from "@/lib/flight/localsdr/parseLocalSdrAircraft";
import { appPath } from "@/lib/paths/appPath";
import type { IFlightProvider } from "@/types/flight-provider";
import type { FlightQuery, FlightState } from "@/types/flight";

const CACHE_MS = 3_000;

/** Pauza nakon 429 s naše rute (rate limit), kad ruta ne pošalje `Retry-After`. */
const RATE_LIMIT_BACKOFF_MS = 5_000;

/** Pauza kad ruta javi da je circuit breaker otvorio krug (503). */
const CIRCUIT_OPEN_BACKOFF_MS = 30_000;

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
  /**
   * Je li pauza posljedica nedostupnog prijemnika (a ne našeg rate limita).
   * Bitno za UI: dok traje takva pauza moramo i dalje **bacati** grešku da
   * `localsdrStatus` ostane "unreachable" — inače bi badge lagao da je Pi online
   * samo zato što ga privremeno ne zovemo.
   */
  private pausedUnreachable = false;

  async getFlightsInBounds(q: FlightQuery): Promise<readonly FlightState[]> {
    const tail = async (): Promise<readonly FlightState[]> => {
      const now = Date.now();
      if (now < this.fetchNotBeforeMs) {
        if (this.pausedUnreachable) {
          const waitSec = Math.ceil((this.fetchNotBeforeMs - now) / 1000);
          throw new Error(
            `Local SDR: receiver unreachable. Retrying in ~${waitSec}s.`
          );
        }
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
        this.fetchNotBeforeMs = Date.now() + retryAfterMs(res, RATE_LIMIT_BACKOFF_MS);
        this.pausedUnreachable = false;
        throw new Error("Local SDR: 429");
      }
      if (res.status === 503) {
        // Ruta je otvorila krug — nema smisla je zvati do isteka pauze.
        this.fetchNotBeforeMs =
          Date.now() + retryAfterMs(res, CIRCUIT_OPEN_BACKOFF_MS);
        this.pausedUnreachable = true;
        throw new Error("Local SDR: receiver unreachable (upstream paused)");
      }
      if (!res.ok) {
        throw new Error(`Local SDR: HTTP ${res.status}`);
      }
      const data: LocalSdrResponse = await res.json();
      this.fetchNotBeforeMs = 0;
      this.pausedUnreachable = false;
      this.cache = { at: Date.now(), data };
      return flightsFromLocalSdrResponse(data, q.bounds);
    };

    const next = this.loadChain.then(tail, tail);
    this.loadChain = next.catch((): readonly FlightState[] => []);
    return next;
  }
}

/** `Retry-After` (sekunde) iz odgovora, ili `fallbackMs` kad ga nema. */
function retryAfterMs(res: Response, fallbackMs: number): number {
  const header = Number(res.headers.get("Retry-After"));
  return Number.isFinite(header) && header > 0 ? header * 1000 : fallbackMs;
}
