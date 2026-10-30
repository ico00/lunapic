import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { RECEIVER_OFFLINE_AFTER_MS, createReceiverWatchdog } = createRequire(import.meta.url)(
  "../../../receiverWatchdog.cjs"
);

const MIN = 60_000;

describe("receiverWatchdog", () => {
  it("šuti dok podaci stižu i kod kratkog prekida", () => {
    const w = createReceiverWatchdog(0);
    w.noteSnapshot(100, 0);
    expect(w.pendingEvent(RECEIVER_OFFLINE_AFTER_MS - 1)).toBeNull();
  });

  it("javlja pad jednom, nakon potvrde više ne", () => {
    const w = createReceiverWatchdog(0);
    w.noteSnapshot(100, 0);
    expect(w.pendingEvent(5 * MIN)).toEqual({ status: "offline", silentMinutes: 5 });
    w.acknowledge("offline");
    expect(w.pendingEvent(30 * MIN)).toBeNull();
  });

  it("neuspjelo slanje ostaje na čekanju dok se ne potvrdi", () => {
    const w = createReceiverWatchdog(0);
    expect(w.pendingEvent(5 * MIN)?.status).toBe("offline");
    expect(w.pendingEvent(6 * MIN)?.status).toBe("offline");
  });

  it("isti snimak nije znak života (readsb pao, push radi dalje)", () => {
    const w = createReceiverWatchdog(0);
    w.noteSnapshot(100, 0);
    w.noteSnapshot(100, 4 * MIN);
    expect(w.pendingEvent(5 * MIN)?.status).toBe("offline");
  });

  it("povratak javlja ukupno trajanje prekida", () => {
    const w = createReceiverWatchdog(0);
    w.noteSnapshot(100, 0);
    w.pendingEvent(5 * MIN);
    w.acknowledge("offline");
    w.noteSnapshot(200, 42 * MIN);
    expect(w.pendingEvent(42 * MIN)).toEqual({ status: "online", silentMinutes: 42 });
    w.acknowledge("online");
    expect(w.pendingEvent(43 * MIN)).toBeNull();
  });

  it("prijemnik koji nikad nije javio broji se od starta procesa", () => {
    const w = createReceiverWatchdog(10 * MIN);
    expect(w.pendingEvent(14 * MIN)).toBeNull();
    expect(w.pendingEvent(15 * MIN)?.status).toBe("offline");
  });
});
