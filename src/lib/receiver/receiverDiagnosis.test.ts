import { describe, expect, it } from "vitest";
import {
  diagnoseReceiver,
  type PiOutage,
  type PiStatus,
} from "./receiverDiagnosis";

const NOW = 1_794_000_000_000;
const SEC = 1000;

const status = (over: Partial<PiStatus> = {}): PiStatus => ({
  at: NOW / SEC,
  state: "ok",
  detail: null,
  uptimeSec: 3600,
  signalPct: 55,
  throttled: "0x0",
  load1: 1,
  readsbAgeSec: 0,
  aircraft: 120,
  pushLastOkAgeSec: 3,
  pushLastError: null,
  pushLastErrorAt: null,
  ...over,
});

const outage = (startAgoSec: number, durSec: number, cause: PiOutage["cause"]): PiOutage => ({
  start: NOW / SEC - startAgoSec,
  end: NOW / SEC - startAgoSec + durSec,
  cause,
  detail: null,
  minSignalPct: null,
  ticks: { [cause]: 1 },
  interruptedByBoot: false,
});

const freshSnapshot = {
  receivedAt: NOW - 2 * SEC,
  readsbNowSec: NOW / SEC - 3,
  aircraftCount: 150,
};

describe("diagnoseReceiver", () => {
  it("ok kad snimak stiže i mijenja se", () => {
    const d = diagnoseReceiver({
      snapshot: freshSnapshot,
      diag: { receivedAt: NOW - 30 * SEC, status: status(), outages: [] },
      nowMs: NOW,
    });
    expect(d.code).toBe("ok");
    expect(d.lastSignalPct).toBe(55);
  });

  it("pi-silent kad ne stiže ni snimak ni izvještaj; od zadnjeg znaka života", () => {
    const d = diagnoseReceiver({
      snapshot: { ...freshSnapshot, receivedAt: NOW - 600 * SEC },
      diag: { receivedAt: NOW - 590 * SEC, status: status({ signalPct: 41 }), outages: [] },
      nowMs: NOW,
    });
    expect(d.code).toBe("pi-silent");
    expect(d.sinceMs).toBe(NOW - 590 * SEC);
    expect(d.lastSignalPct).toBe(41);
  });

  it("push-failing kad se Pi javlja, a snimak ne stiže — s greškom slanja", () => {
    const d = diagnoseReceiver({
      snapshot: { ...freshSnapshot, receivedAt: NOW - 300 * SEC },
      diag: {
        receivedAt: NOW - 20 * SEC,
        status: status({ state: "server", pushLastError: "HTTP 413" }),
        outages: [],
      },
      nowMs: NOW,
    });
    expect(d.code).toBe("push-failing");
    expect(d.detail).toBe("HTTP 413");
    expect(d.sinceMs).toBe(NOW - 300 * SEC);
  });

  it("receiver-stale kad snimak stiže, ali readsb ga ne obnavlja", () => {
    const d = diagnoseReceiver({
      snapshot: { ...freshSnapshot, readsbNowSec: NOW / SEC - 120 },
      diag: { receivedAt: null, status: null, outages: [] },
      nowMs: NOW,
    });
    expect(d.code).toBe("receiver-stale");
  });

  it("no-aircraft kad snimak stiže bez ijednog aviona", () => {
    const d = diagnoseReceiver({
      snapshot: { ...freshSnapshot, aircraftCount: 0 },
      diag: { receivedAt: null, status: null, outages: [] },
      nowMs: NOW,
    });
    expect(d.code).toBe("no-aircraft");
  });

  it("no-data kad Pi nikad nije poslao ništa", () => {
    const d = diagnoseReceiver({
      snapshot: null,
      diag: { receivedAt: null, status: null, outages: [] },
      nowMs: NOW,
    });
    expect(d.code).toBe("no-data");
  });

  it("nabraja samo prekide od barem minute iz zadnjih 7 dana", () => {
    const d = diagnoseReceiver({
      snapshot: freshSnapshot,
      diag: {
        receivedAt: NOW,
        status: status(),
        outages: [
          outage(3600, 30, "internet"),
          outage(7200, 120, "internet"),
          outage(8 * 24 * 3600, 600, "pi-down"),
        ],
      },
      nowMs: NOW,
    });
    expect(d.recentOutages.map((o) => o.end - o.start)).toEqual([120]);
  });
});
