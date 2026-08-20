/**
 * Praćenje preostalih OpenSky kredita (`X-Rate-Limit-Remaining`).
 *
 * OpenSky naplaćuje **kredite po zahtjevu** — dnevno 400 anonimno, 4000 uz
 * OAuth2 API client, 8000 za aktivne feedere. Do sada se potrošnja doznavala
 * tek kad feed padne na 429, što je prekasno: kvota se ne obnavlja do sljedećeg
 * dana. Upstream šalje stanje na svakom odgovoru, samo ga proxy nije čitao.
 */

/** Ispod ovoga se u server log upisuje upozorenje na svakom novom očitanju. */
export const OPENSKY_LOW_CREDITS_WARN_BELOW = 200;

/** `X-Rate-Limit-Remaining` → broj, ili `null` kad zaglavlja nema / nije broj. */
export function parseRateLimitRemaining(raw: string | null): number | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim();
  // `Number("")` je 0 — prazno zaglavlje bi inače značilo "nula kredita" i
  // okinulo lažnu uzbunu.
  if (trimmed === "") {
    return null;
  }
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export interface OpenSkyCreditsTracker {
  /** Zapamti očitanje s upstream odgovora. Vraća parsiranu vrijednost. */
  record(raw: string | null): number | null;
  /** Zadnje poznato stanje, ili `null` ako još nije bilo upstream odgovora. */
  lastKnown(): number | null;
  /** Je li zadnje očitanje ispod praga upozorenja. */
  isLow(): boolean;
}

/**
 * Zadnje očitanje živi u memoriji procesa (isto ograničenje kao `rateLimiter` i
 * `ttlBodyCache`) — služi da i odgovor iz predmemorije može reći koliko je
 * kredita bilo pri zadnjem stvarnom pozivu, umjesto da zaglavlje nestane.
 */
export function createOpenSkyCreditsTracker(): OpenSkyCreditsTracker {
  let last: number | null = null;

  return {
    record(raw) {
      const parsed = parseRateLimitRemaining(raw);
      if (parsed != null) {
        last = parsed;
      }
      return parsed;
    },
    lastKnown() {
      return last;
    },
    isLow() {
      return last != null && last < OPENSKY_LOW_CREDITS_WARN_BELOW;
    },
  };
}
