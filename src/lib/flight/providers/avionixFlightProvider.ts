import {
  flightsFromAvionixResponse,
  type AvionixResponse,
} from "@/lib/flight/avionix/parseAvionixAircraft";
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
  readonly data: AvionixResponse;
};

type LastRawFix = {
  readonly lat: number;
  readonly lng: number;
  readonly timestamp: number;
};

/**
 * Avionix Nano ADS-B (openAir firmware) via `/api/avionix/aircraft`.
 * Uređaj pusha snapshot na `/api/avionix/ingest` (produkcija); `AVIONIX_URL`
 * je local-dev-only pull fallback. Tiho vraća prazan popis dok nijedno nije
 * konfigurirano.
 */
export class AvionixFlightProvider implements IFlightProvider {
  readonly id = "avionix" as const;

  private cache: CacheEntry | null = null;
  private loadChain: Promise<readonly FlightState[]> = Promise.resolve([]);
  private fetchNotBeforeMs = 0;
  /**
   * Uređaj nema per-aircraft "seen_pos" polje (za razliku od localsdr/dump1090)
   * — `flightsFromAvionixResponse` zato svakom avionu u snapshotu pripiše ISTI
   * response-level timestamp, čak i kad njegov red u uređajevoj internoj tablici
   * nije stvarno osvježen od prošlog polla (device-side lag). `extrapolateFlightForDisplay`
   * nema smoothing — svaki reset timestamp-a na "sad" bez stvarne nove pozicije
   * izgleda kao skok unatrag (marker je već ekstrapolirao naprijed od stare
   * pozicije, pa se vrati na nju). Popravak: pamti zadnju STVARNU (promijenjenu)
   * lat/lng po `id` (== icao24 za avionix); dok se pozicija ne promijeni, zadrži stari timestamp
   * umjesto da ga parser resetira — isti ishod kao localsdr-ov `seen_pos`, samo
   * izveden ovdje jer uređaj tu informaciju ne daje izravno.
   */
  private lastRawFixByIcao = new Map<string, LastRawFix>();
  /**
   * Je li pauza posljedica nedostupnog prijemnika (a ne našeg rate limita).
   * Bitno za UI: dok traje takva pauza moramo i dalje **bacati** grešku da
   * `avionixStatus` ostane "unreachable" — inače bi badge lagao da je uređaj
   * online samo zato što ga privremeno ne zovemo.
   */
  private pausedUnreachable = false;

  /**
   * Vidi napomenu uz `lastRawFixByIcao`: dok se lat/lng za icao24 ne promijeni
   * od zadnjeg polla, zadrži prijašnji timestamp umjesto onog koji je parser
   * pripisao ovom snapshotu.
   */
  private stabilizeTimestamps(
    flights: readonly FlightState[]
  ): readonly FlightState[] {
    return flights.map((f) => {
      const prev = this.lastRawFixByIcao.get(f.id);
      if (prev && prev.lat === f.position.lat && prev.lng === f.position.lng) {
        return f.timestamp === prev.timestamp ? f : { ...f, timestamp: prev.timestamp };
      }
      this.lastRawFixByIcao.set(f.id, {
        lat: f.position.lat,
        lng: f.position.lng,
        timestamp: f.timestamp,
      });
      return f;
    });
  }

  async getFlightsInBounds(q: FlightQuery): Promise<readonly FlightState[]> {
    const tail = async (): Promise<readonly FlightState[]> => {
      const now = Date.now();
      if (now < this.fetchNotBeforeMs) {
        if (this.pausedUnreachable) {
          const waitSec = Math.ceil((this.fetchNotBeforeMs - now) / 1000);
          throw new Error(
            `Avionix: receiver unreachable. Retrying in ~${waitSec}s.`
          );
        }
        return this.cache
          ? this.stabilizeTimestamps(flightsFromAvionixResponse(this.cache.data, q.bounds))
          : [];
      }
      if (this.cache && now - this.cache.at < CACHE_MS) {
        return this.stabilizeTimestamps(flightsFromAvionixResponse(this.cache.data, q.bounds));
      }
      const res = await fetch(appPath("/api/avionix/aircraft"), {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status === 429) {
        this.fetchNotBeforeMs = Date.now() + retryAfterMs(res, RATE_LIMIT_BACKOFF_MS);
        this.pausedUnreachable = false;
        throw new Error("Avionix: 429");
      }
      if (res.status === 503) {
        // Ruta je otvorila krug — nema smisla je zvati do isteka pauze.
        this.fetchNotBeforeMs =
          Date.now() + retryAfterMs(res, CIRCUIT_OPEN_BACKOFF_MS);
        this.pausedUnreachable = true;
        throw new Error("Avionix: receiver unreachable (upstream paused)");
      }
      if (!res.ok) {
        throw new Error(`Avionix: HTTP ${res.status}`);
      }
      const data: AvionixResponse = await res.json();
      this.fetchNotBeforeMs = 0;
      this.pausedUnreachable = false;
      this.cache = { at: Date.now(), data };
      return this.stabilizeTimestamps(flightsFromAvionixResponse(data, q.bounds));
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
