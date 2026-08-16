/**
 * Circuit breaker za upstream proxy rute.
 *
 * Zašto: kad vanjski feed umre (ugašen servis, Cloudflare blok, uveden API
 * ključ), svaki poll tick svakog otvorenog browsera i dalje ide na taj host.
 * Rezultat je konstantan red pogrešaka u konzoli, uzaludna latencija na svakom
 * zahtjevu i nepotreban promet prema servisu koji nas ionako odbija. Breaker
 * nakon nekoliko uzastopnih neuspjeha prestaje pokušavati i odmah vraća odgovor
 * pozivatelju, pa se stanje "izvor je mrtav" vidi jasno i jeftino.
 *
 * Stanja:
 * * `closed`    — normalan rad, zahtjevi prolaze.
 * * `open`      — prag neuspjeha probijen; zahtjevi se odbijaju bez mrežnog
 *                 poziva dok ne prođe `openMs`.
 * * `half-open` — nakon `openMs` propušta se **jedan** probni zahtjev; uspjeh
 *                 zatvara krug, neuspjeh ga ponovno otvara na `openMs`.
 *
 * Radi **samo** na persistentnom Node procesu (cPanel / `server.js`) — isto
 * ograničenje kao `rateLimiter` i `ttlBodyCache`. Na serverless okruženju stanje
 * se može resetirati između invokacija, pa je ovo best-effort.
 */

export type CircuitState = "closed" | "open" | "half-open";

export type CircuitDecision =
  | { readonly allowed: true; readonly state: CircuitState }
  | {
      readonly allowed: false;
      readonly state: "open";
      /** Koliko ms do sljedećeg probnog zahtjeva. */
      readonly retryAfterMs: number;
    };

export interface UpstreamCircuitBreaker {
  /** Smije li se sada zvati upstream? Poziva se prije svakog pokušaja. */
  check(nowMs?: number): CircuitDecision;
  /** Upstream je odgovorio kako treba — zatvori krug i resetiraj brojač. */
  recordSuccess(): void;
  /** Upstream je pao (mrežna greška ili neupotrebljiv status). */
  recordFailure(nowMs?: number): void;
  /** Trenutno stanje (za dijagnostičke headere / testove). */
  state(nowMs?: number): CircuitState;
  /** Broj uzastopnih neuspjeha otkad je krug zadnji put bio zatvoren. */
  consecutiveFailures(): number;
}

export type CircuitBreakerOptions = {
  /** Koliko uzastopnih neuspjeha otvara krug. */
  readonly failureThreshold: number;
  /** Koliko dugo krug ostaje otvoren prije probnog zahtjeva (ms). */
  readonly openMs: number;
};

export function createUpstreamCircuitBreaker(
  opts: CircuitBreakerOptions
): UpstreamCircuitBreaker {
  let failures = 0;
  /** 0 = krug nije otvoren. */
  let openedAt = 0;
  /** Probni zahtjev u half-open stanju je već propušten i još nije razriješen. */
  let probeInFlight = false;

  function currentState(nowMs: number): CircuitState {
    if (openedAt === 0) return "closed";
    return nowMs - openedAt >= opts.openMs ? "half-open" : "open";
  }

  return {
    check(nowMs = Date.now()) {
      const state = currentState(nowMs);
      if (state === "closed") {
        return { allowed: true, state };
      }
      if (state === "open") {
        return {
          allowed: false,
          state: "open",
          retryAfterMs: Math.max(0, opts.openMs - (nowMs - openedAt)),
        };
      }
      // half-open: propusti točno jedan probni zahtjev dok se ne razriješi.
      if (probeInFlight) {
        return { allowed: false, state: "open", retryAfterMs: opts.openMs };
      }
      probeInFlight = true;
      return { allowed: true, state };
    },

    recordSuccess() {
      failures = 0;
      openedAt = 0;
      probeInFlight = false;
    },

    recordFailure(nowMs = Date.now()) {
      failures += 1;
      probeInFlight = false;
      if (failures >= opts.failureThreshold) {
        // Neuspjeli probni zahtjev u half-open stanju gura krug u novi `openMs`.
        openedAt = nowMs;
      }
    },

    state(nowMs = Date.now()) {
      return currentState(nowMs);
    },

    consecutiveFailures() {
      return failures;
    },
  };
}
