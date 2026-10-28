import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const snapshotStore = vi.hoisted(() => ({
  readAvionixSnapshot: vi.fn(),
  isAvionixSnapshotFresh: vi.fn(),
}));
vi.mock("@/lib/server/avionixSnapshotStore", () => snapshotStore);
vi.mock("@/lib/server/rateLimiter", () => ({ rejectIfRateLimited: () => null }));

describe("Avionix push availability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AVIONIX_URL", "");
    snapshotStore.readAvionixSnapshot.mockReset();
    snapshotStore.isAvionixSnapshotFresh.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([null, { receivedAt: Date.now() - 120_000, body: "{}" }])(
    "reports missing or stale push data as unavailable (%j)",
    async (snapshot) => {
      snapshotStore.readAvionixSnapshot.mockReturnValue(snapshot);
      snapshotStore.isAvionixSnapshotFresh.mockReturnValue(false);
      const { GET } = await import("./route");
      const res = await GET(new Request("http://localhost/api/avionix/aircraft"));
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("10");
      expect(res.headers.get("Cache-Control")).toContain("no-store");
    }
  );

  it("keeps a fresh receiver online even when it sees no aircraft", async () => {
    const body = JSON.stringify({ timestamp: String(Date.now()) });
    snapshotStore.readAvionixSnapshot.mockReturnValue({ receivedAt: Date.now(), body });
    snapshotStore.isAvionixSnapshotFresh.mockReturnValue(true);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/avionix/aircraft"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body);
  });
});
