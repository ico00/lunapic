import { describe, expect, it } from "vitest";
import {
  adsbEmitterCategoryFromDesignator,
  adsbEmitterCategoryLabel,
} from "./emitterCategory";

describe("adsbEmitterCategoryFromDesignator", () => {
  it.each([
    ["A1", "Light (< 15 500 lb)"],
    ["A3", "Large (75 000–300 000 lb)"],
    ["A5", "Heavy (> 300 000 lb)"],
    ["A7", "Rotorcraft"],
    ["B1", "Glider / sailplane"],
    ["B6", "Unmanned aerial vehicle"],
    ["C1", "Surface vehicle — emergency"],
    ["C3", "Point obstacle"],
  ])("%s → %s", (designator, label) => {
    expect(adsbEmitterCategoryLabel(adsbEmitterCategoryFromDesignator(designator))).toBe(label);
  });

  it.each(["A0", "B0", "C0", "C6", "D1", "", null, undefined])("%s nema kategorije", (d) => {
    expect(adsbEmitterCategoryFromDesignator(d)).toBeNull();
  });
});
