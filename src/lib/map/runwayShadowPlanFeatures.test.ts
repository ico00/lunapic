import { describe, expect, it } from "vitest";
import { computeRunwayShadowPlan } from "@/lib/domain/geometry/runwayShadowPlan";
import { buildRunwayShadowPlanFeatures } from "./runwayShadowPlanFeatures";

const T0 = Date.UTC(2026, 9, 28, 6, 20, 0);

const lines = computeRunwayShadowPlan({
  startMs: T0,
  endMs: T0 + 600_000,
  stepMs: 600_000,
  flows: ["landing04", "departure22"],
  minCoveragePercent: 0,
});

describe("buildRunwayShadowPlanFeatures", () => {
  it("is empty for no lines", () => {
    expect(buildRunwayShadowPlanFeatures([], null).features).toEqual([]);
  });

  it("emits a line, a clock label and markers per planned line", () => {
    const fc = buildRunwayShadowPlanFeatures(lines, null);
    const kinds = (k: string) => fc.features.filter((f) => f.properties?.kind === k);
    expect(kinds("line").length).toBe(lines.length);
    expect(kinds("time").length).toBe(lines.length);
    expect(kinds("marker").length).toBe(
      lines.reduce((n, l) => n + l.points.filter((p) => p.isMarker).length, 0)
    );
    expect(kinds("line").every((f) => f.geometry.type === "LineString")).toBe(true);
  });

  it("keeps every feature active with no focus", () => {
    const fc = buildRunwayShadowPlanFeatures(lines, null);
    expect(fc.features.every((f) => f.properties?.active === true)).toBe(true);
  });

  it("draws only the focused instant when asked to", () => {
    const fc = buildRunwayShadowPlanFeatures(lines, T0, true);
    expect(fc.features.length).toBeGreaterThan(0);
    expect(fc.features.every((f) => f.properties?.timeMs === T0)).toBe(true);
  });

  it("onlyFocused without a focus still draws everything", () => {
    const all = buildRunwayShadowPlanFeatures(lines, null, false);
    expect(buildRunwayShadowPlanFeatures(lines, null, true).features).toHaveLength(all.features.length);
  });

  it("dims everything except the focused instant", () => {
    const fc = buildRunwayShadowPlanFeatures(lines, T0);
    for (const f of fc.features) {
      expect(f.properties?.active).toBe(f.properties?.timeMs === T0);
    }
    expect(fc.features.some((f) => f.properties?.active === false)).toBe(true);
  });
});
