import { beforeEach, describe, expect, it, vi } from "vitest";

const diagStore = vi.hoisted(() => ({
  recordSdrDiag: vi.fn(() => ({ accepted: 1, outages: 1 })),
}));
vi.mock("@/lib/server/sdrDiagStore", () => diagStore);

const TOKEN = "test-token";

function post(body: string, token = TOKEN): Request {
  return new Request("http://localhost/api/localsdr/diag", {
    method: "POST",
    headers: { "x-sdr-token": token, "Content-Type": "application/json" },
    body,
  });
}

describe("localsdr diag", () => {
  beforeEach(() => {
    vi.stubEnv("SDR_INGEST_TOKEN", TOKEN);
    diagStore.recordSdrDiag.mockClear();
  });

  it("sprema izvještaj s ispravnim tokenom", async () => {
    const { POST } = await import("./route");
    const report = { status: { at: 1_794_000_000, state: "ok" }, outages: [] };
    const res = await POST(post(JSON.stringify(report)));
    expect(res.status).toBe(200);
    expect(diagStore.recordSdrDiag).toHaveBeenCalledWith(report);
  });

  it("odbija pogrešan token", async () => {
    const { POST } = await import("./route");
    const res = await POST(post("{}", "wrong"));
    expect(res.status).toBe(403);
    expect(diagStore.recordSdrDiag).not.toHaveBeenCalled();
  });

  it("odbija pokvaren JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(post("not json"));
    expect(res.status).toBe(400);
  });
});
