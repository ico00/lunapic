import { afterEach, describe, expect, it, vi } from "vitest";
import { clearFieldPerfRings, fieldPerfTime, getFieldPerfSnapshot } from "./fieldPerf";

describe("fieldPerf", () => {
  afterEach(() => {
    clearFieldPerfRings();
    vi.unstubAllGlobals();
  });

  it("fieldPerfTime runs fn and records when global perf + env flag", () => {
    const now = vi.fn();
    now
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10);
    vi.stubGlobal("performance", { now } as unknown as Performance);

    vi.stubGlobal(
      "window",
      { localStorage: { getItem: () => null } } as unknown as Window & typeof globalThis
    );
    const prev = process.env.NEXT_PUBLIC_FIELD_PERF;
    process.env.NEXT_PUBLIC_FIELD_PERF = "1";
    const out = fieldPerfTime("t:x", () => 42);
    process.env.NEXT_PUBLIC_FIELD_PERF = prev;

    expect(out).toBe(42);
    const e = getFieldPerfSnapshot().entries.find((q) => q.name === "t:x");
    expect(e?.last).toBe(10);
  });

  it("fieldPerfTime skips measurement when not enabled and window missing", () => {
    const out = fieldPerfTime("t:y", () => 7);
    expect(out).toBe(7);
    expect(getFieldPerfSnapshot().entries.length).toBe(0);
  });
});
