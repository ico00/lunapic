import { describe, expect, it } from "vitest";

import { createUpstreamCircuitBreaker } from "./upstreamCircuitBreaker";

const OPTS = { failureThreshold: 3, openMs: 60_000 } as const;

describe("upstreamCircuitBreaker", () => {
  it("propušta zahtjeve dok je ispod praga neuspjeha", () => {
    const cb = createUpstreamCircuitBreaker(OPTS);
    cb.recordFailure(1_000);
    cb.recordFailure(2_000);
    expect(cb.state(3_000)).toBe("closed");
    expect(cb.check(3_000).allowed).toBe(true);
  });

  it("otvara krug na pragu i odbija bez mrežnog poziva", () => {
    const cb = createUpstreamCircuitBreaker(OPTS);
    for (const t of [1_000, 2_000, 3_000]) cb.recordFailure(t);

    const decision = cb.check(4_000);
    expect(decision.allowed).toBe(false);
    expect(decision.state).toBe("open");
    if (!decision.allowed) {
      // Otvoren u 3_000, provjera u 4_000 → preostaje 59 s.
      expect(decision.retryAfterMs).toBe(59_000);
    }
  });

  it("nakon openMs propušta točno jedan probni zahtjev", () => {
    const cb = createUpstreamCircuitBreaker(OPTS);
    for (const t of [1_000, 2_000, 3_000]) cb.recordFailure(t);

    const at = 3_000 + OPTS.openMs;
    expect(cb.state(at)).toBe("half-open");
    expect(cb.check(at).allowed).toBe(true);
    // Drugi paralelni zahtjev dok je proba u letu ne smije proći.
    expect(cb.check(at).allowed).toBe(false);
  });

  it("uspjeh probnog zahtjeva zatvara krug i briše brojač", () => {
    const cb = createUpstreamCircuitBreaker(OPTS);
    for (const t of [1_000, 2_000, 3_000]) cb.recordFailure(t);
    const at = 3_000 + OPTS.openMs;
    cb.check(at);

    cb.recordSuccess();

    expect(cb.state(at)).toBe("closed");
    expect(cb.consecutiveFailures()).toBe(0);
    expect(cb.check(at).allowed).toBe(true);
  });

  it("neuspjeh probnog zahtjeva ponovno otvara krug na puni openMs", () => {
    const cb = createUpstreamCircuitBreaker(OPTS);
    for (const t of [1_000, 2_000, 3_000]) cb.recordFailure(t);
    const at = 3_000 + OPTS.openMs;
    cb.check(at);

    cb.recordFailure(at);

    expect(cb.state(at + 1)).toBe("open");
    const decision = cb.check(at + 1);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.retryAfterMs).toBe(OPTS.openMs - 1);
    }
  });

  it("uspjeh usred niza neuspjeha resetira brojač (nema akumulacije)", () => {
    const cb = createUpstreamCircuitBreaker(OPTS);
    cb.recordFailure(1_000);
    cb.recordFailure(2_000);
    cb.recordSuccess();
    cb.recordFailure(3_000);
    cb.recordFailure(4_000);

    expect(cb.consecutiveFailures()).toBe(2);
    expect(cb.state(5_000)).toBe("closed");
  });
});
