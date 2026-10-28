import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransitCandidate } from "@/types";
const mocks = vi.hoisted(() => ({ candidates: vi.fn(), active: vi.fn(), send: vi.fn(), subs: vi.fn() }));
vi.mock("@/lib/domain/transit/computeTransitCandidates", () => ({ computeTransitCandidates: mocks.candidates }));
vi.mock("@/lib/domain/transit/computeActiveTransits", () => ({ computeActiveTransits: mocks.active }));
vi.mock("@/lib/server/pushSubsStore", () => ({ readSubs: mocks.subs }));
vi.mock("@/lib/server/webPush", () => ({ isVapidConfigured: () => true, sendToSubscriptions: mocks.send }));
const flight = { id:"a", position:{lat:45,lng:16}, timestamp:1000, groundSpeedMps:200, trackDeg:90,
  geoAltitudeMeters:10000, baroAltitudeMeters:null };
function candidate(timestamp: number): TransitCandidate {
  return { flight: {...flight,timestamp}, separationDeg:5, elevationGapDeg:0, isPossibleTransit:false, willTransit:true,
    prediction:{fixTimestampMs:timestamp,lat:45+timestamp/1e6,lng:16,providerId:"localsdr",alignmentAtMs:1000000} };
}
function request(flights = [flight]) {
  return new Request("http://localhost/api/transit/scan", {method:"POST", headers:{"x-internal-token":"test"}, body:JSON.stringify({flights})});
}
describe("server candidate alert confirmation", () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); vi.stubEnv("INTERNAL_SCAN_TOKEN","test");
    vi.useFakeTimers(); vi.setSystemTime(200000);
    mocks.subs.mockReturnValue({ endpoint:{observer:{lat:45,lng:16,groundHeightMeters:0}} });
    mocks.active.mockReturnValue([]); mocks.send.mockResolvedValue({sent:1});
  });
  afterEach(() => {vi.useRealTimers();vi.unstubAllEnvs();});
  it("pushes only after two independent positive fixes, then deduplicates", async () => {
    const {POST} = await import("./route");
    mocks.candidates.mockReturnValue([candidate(1000)]);
    await POST(request()); await POST(request());
    expect(mocks.send).not.toHaveBeenCalled();
    vi.setSystemTime(210000); mocks.candidates.mockReturnValue([candidate(11000)]);
    await POST(request()); await POST(request());
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("an empty scan clears prior evidence", async () => {
    const {POST} = await import("./route");
    mocks.candidates.mockReturnValue([candidate(1000)]); await POST(request());
    mocks.candidates.mockReturnValue([]); await POST(request([]));
    mocks.candidates.mockReturnValue([candidate(11000)]); await POST(request());
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not carry confirmation across an observer change", async () => {
    const {POST} = await import("./route");
    mocks.candidates.mockReturnValue([candidate(1000)]); await POST(request());
    mocks.subs.mockReturnValue({ endpoint:{observer:{lat:46,lng:16,groundHeightMeters:0}} });
    mocks.candidates.mockReturnValue([candidate(11000)]); await POST(request());
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
