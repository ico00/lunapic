import { beforeEach, describe, expect, it, vi } from "vitest";

const webPush = vi.hoisted(() => ({
  isVapidConfigured: vi.fn(),
  sendToSubscriptions: vi.fn(),
}));
vi.mock("@/lib/server/webPush", () => webPush);
vi.mock("@/lib/server/pushSubsStore", () => ({
  readSubs: () => ({ a: { endpoint: "a" }, b: { endpoint: "b" } }),
}));

function post(body: unknown, token = "tok"): Request {
  return new Request("http://localhost/api/push/receiver-status", {
    method: "POST",
    headers: { "x-internal-token": token },
    body: JSON.stringify(body),
  });
}

describe("receiver-status push", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_SCAN_TOKEN", "tok");
    webPush.isVapidConfigured.mockReturnValue(true);
    webPush.sendToSubscriptions.mockReset().mockResolvedValue({ sent: 2, expired: 0 });
  });

  it("javlja pad svim pretplatama, bez obzira na lokaciju", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ status: "offline", silentMinutes: 5 }));
    expect(await res.json()).toEqual({ sent: 2 });
    const [subs, payload] = webPush.sendToSubscriptions.mock.calls[0];
    expect(subs).toHaveLength(2);
    expect(payload.title).toContain("offline");
    expect(payload.body).toContain("5 min");
  });

  it("povratak zamjenjuje obavijest o padu istim tagom", async () => {
    const { POST } = await import("./route");
    await POST(post({ status: "offline", silentMinutes: 5 }));
    await POST(post({ status: "online", silentMinutes: 42 }));
    const [[, down], [, up]] = webPush.sendToSubscriptions.mock.calls;
    expect(up.tag).toBe(down.tag);
    expect(up.body).toContain("42 min");
  });

  it("odbija pogrešan token i neispravan status", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ status: "offline", silentMinutes: 5 }, "x"))).status).toBe(403);
    expect((await POST(post({ status: "down", silentMinutes: 5 }))).status).toBe(400);
    expect(webPush.sendToSubscriptions).not.toHaveBeenCalled();
  });
});
