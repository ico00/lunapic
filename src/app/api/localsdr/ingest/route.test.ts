import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const snapshotStore = vi.hoisted(() => ({ writeSdrSnapshot: vi.fn() }));
vi.mock("@/lib/server/sdrSnapshotStore", () => snapshotStore);

const TOKEN = "test-token";
const SNAPSHOT = JSON.stringify({ now: 1, aircraft: [{ hex: "4d2455" }] });

function post(body: BodyInit, token = TOKEN): Request {
  return new Request("http://localhost/api/localsdr/ingest", {
    method: "POST",
    headers: { "x-sdr-token": token },
    body,
  });
}

describe("localsdr ingest", () => {
  beforeEach(() => {
    vi.stubEnv("SDR_INGEST_TOKEN", TOKEN);
    snapshotStore.writeSdrSnapshot.mockReset();
  });

  it("prima gzip i sprema raspakirani JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(gzipSync(SNAPSHOT)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, aircraft: 1 });
    expect(snapshotStore.writeSdrSnapshot).toHaveBeenCalledWith(SNAPSHOT);
  });

  it("i dalje prima običan JSON (Pi sa starom skriptom)", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(SNAPSHOT));
    expect(res.status).toBe(200);
    expect(snapshotStore.writeSdrSnapshot).toHaveBeenCalledWith(SNAPSHOT);
  });

  it("odbija pokvaren gzip bez diranja zadnjeg snimka", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(gzipSync(SNAPSHOT).subarray(0, 12)));
    expect(res.status).toBe(400);
    expect(snapshotStore.writeSdrSnapshot).not.toHaveBeenCalled();
  });

  it("odbija gzip koji se raspakira preko granice", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(gzipSync(Buffer.alloc(5 * 1024 * 1024, 32))));
    expect(res.status).toBe(413);
    expect(snapshotStore.writeSdrSnapshot).not.toHaveBeenCalled();
  });

  it("odbija pogrešan token", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(gzipSync(SNAPSHOT), "wrong"));
    expect(res.status).toBe(403);
  });
});
