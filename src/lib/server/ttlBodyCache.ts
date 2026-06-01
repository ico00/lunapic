/**
 * Mali in-memory TTL cache za sirova JSON tijela upstream proxy odgovora.
 *
 * Dijele ga `api/opensky/states` i `api/adsbone/point` — oba kratko keširaju
 * upstream odgovor po grubom (lat/lng/bbox) ključu da smanje 429 i upstream pozive.
 *
 * Radi samo na persistentnom Node procesu (cPanel/`server.js`); na serverless
 * okruženjima memorija se može resetirati između invokacija (best-effort).
 */

type Entry = { expiresAt: number; body: string };

export interface TtlBodyCache {
  /** Vrati tijelo ako postoji i nije isteklo, inače `null`. */
  get(key: string): string | null;
  /** Spremi tijelo s TTL-om; usput očisti istekle i prekobrojne ključeve. */
  set(key: string, body: string): void;
}

export function createTtlBodyCache(
  ttlMs: number,
  maxKeys: number
): TtlBodyCache {
  const store = new Map<string, Entry>();

  function prune(): void {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt <= now) store.delete(k);
    }
    // Map čuva redoslijed umetanja → najstariji ključ je prvi (FIFO evikcija).
    while (store.size > maxKeys) {
      const first = store.keys().next().value;
      if (first === undefined) break;
      store.delete(first);
    }
  }

  return {
    get(key) {
      const hit = store.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.body;
      return null;
    },
    set(key, body) {
      prune();
      store.set(key, { expiresAt: Date.now() + ttlMs, body });
    },
  };
}
