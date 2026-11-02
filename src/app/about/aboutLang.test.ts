import { describe, expect, it } from "vitest";
import { readAboutLangCookie, resolveAboutLang } from "./aboutLang";

describe("resolveAboutLang", () => {
  it("prefers the saved choice over the browser language", () => {
    expect(resolveAboutLang("en", "hr-HR,hr;q=0.9")).toBe("en");
    expect(resolveAboutLang("hr", "en-US")).toBe("hr");
  });

  it("uses Croatian for the languages of the region", () => {
    expect(resolveAboutLang(undefined, "hr-HR,hr;q=0.9,en;q=0.8")).toBe("hr");
    expect(resolveAboutLang(undefined, "sr-Latn")).toBe("hr");
  });

  it("falls back to English", () => {
    expect(resolveAboutLang(undefined, "de-DE,hr;q=0.5")).toBe("en");
    expect(resolveAboutLang("fr", null)).toBe("en");
  });
});

describe("readAboutLangCookie", () => {
  it("reads the value among other cookies", () => {
    expect(readAboutLangCookie("a=1; about-lang=hr; b=2")).toBe("hr");
  });

  it("ignores missing or invalid values", () => {
    expect(readAboutLangCookie("a=1")).toBeNull();
    expect(readAboutLangCookie("about-lang=de")).toBeNull();
  });
});
