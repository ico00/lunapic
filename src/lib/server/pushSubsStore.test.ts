import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const record = (endpoint: string) => ({ endpoint, keys: { p256dh: "p", auth: "a" } });

describe("pushSubsStore", () => {
  let dir: string;
  const subsFile = () => path.join(dir, "data", "push-subscriptions.json");

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "push-subs-"));
    vi.resetModules();
    vi.spyOn(process, "cwd").mockReturnValue(dir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips subscriptions and leaves no temp file behind", async () => {
    const { readSubs, writeSubs } = await import("./pushSubsStore");
    writeSubs({ a: record("a") });
    expect(readSubs()).toEqual({ a: record("a") });
    expect(fs.readdirSync(path.dirname(subsFile()))).toEqual(["push-subscriptions.json"]);
  });

  it("keeps the previous file intact when a write is interrupted", async () => {
    const { readSubs, writeSubs } = await import("./pushSubsStore");
    writeSubs({ a: record("a"), b: record("b") });
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("ENOSPC");
    });
    expect(() => writeSubs({ c: record("c") })).toThrow("ENOSPC");
    expect(Object.keys(readSubs())).toEqual(["a", "b"]);
  });
});
