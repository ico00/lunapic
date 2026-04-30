import { moonFieldVisibilityAdvice } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { describe, expect, it } from "vitest";

describe("moonFieldVisibilityAdvice", () => {
  it("critical below 5°", () => {
    const a = moonFieldVisibilityAdvice(4.9);
    expect(a.tier).toBe("critical");
    expect(a.label).toContain("Critical");
  });

  it("caution from 5° up to 12°", () => {
    expect(moonFieldVisibilityAdvice(5).tier).toBe("caution");
    expect(moonFieldVisibilityAdvice(11.9).tier).toBe("caution");
  });

  it("optimal at 12° and above", () => {
    expect(moonFieldVisibilityAdvice(12).tier).toBe("optimal");
    expect(moonFieldVisibilityAdvice(45).tier).toBe("optimal");
  });

  it("negative altitude is critical", () => {
    expect(moonFieldVisibilityAdvice(-2).tier).toBe("critical");
  });
});
