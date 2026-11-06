import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { mergeSdrDiag, sanitizeOutage, MAX_OUTAGES } = createRequire(import.meta.url)(
  "../../../sdrDiag.cjs"
);

const EMPTY = { receivedAt: null, status: null, outages: [] };
const T = 1_794_000_000;

const raw = (start: number, cause = "internet") => ({
  start,
  end: start + 90,
  cause,
  detail: "x",
  minSignal: 50,
  ticks: { [cause]: 6 },
});

describe("sdrDiag", () => {
  it("ponovljeni izvještaj ne udvostručuje prekid", () => {
    const a = mergeSdrDiag(EMPTY, { outages: [raw(T)] }, 1).next;
    const b = mergeSdrDiag(a, { outages: [raw(T), raw(T + 500, "wifi")] }, 2).next;
    expect(b.outages.map((o: { cause: string }) => o.cause)).toEqual(["wifi", "internet"]);
  });

  it("zadržava zadnje stanje kad izvještaj nosi samo prekide", () => {
    const a = mergeSdrDiag(EMPTY, { status: { at: T, state: "ok", signalPct: 60 } }, 1).next;
    const b = mergeSdrDiag(a, { outages: [raw(T)] }, 2).next;
    expect(b.status.signalPct).toBe(60);
    expect(b.receivedAt).toBe(2);
  });

  it("odbacuje nepoznat uzrok, obrnut interval i besmisleno vrijeme", () => {
    expect(sanitizeOutage({ ...raw(T), cause: "aliens" })).toBeNull();
    expect(sanitizeOutage({ ...raw(T), end: T - 1 })).toBeNull();
    expect(sanitizeOutage({ ...raw(5), end: 100 })).toBeNull();
    expect(sanitizeOutage(raw(T))?.minSignalPct).toBe(50);
  });

  it("čuva najviše MAX_OUTAGES najnovijih", () => {
    const many = Array.from({ length: MAX_OUTAGES + 5 }, (_, i) => raw(T + i * 100));
    const { next } = mergeSdrDiag(EMPTY, { outages: many }, 1);
    expect(next.outages).toHaveLength(MAX_OUTAGES);
    expect(next.outages[0].start).toBe(T + (MAX_OUTAGES + 4) * 100);
  });
});
