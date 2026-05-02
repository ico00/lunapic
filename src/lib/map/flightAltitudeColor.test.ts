import { describe, expect, it } from "vitest";

import {
  flightAltitudeLegendGradientCss,
  flightFeatureColorMapboxExpression,
  flightFeatureColorMapboxExpressionForAltitudeTint,
  flightFeatureFlatColorMapboxExpression,
} from "./flightAltitudeColor";

describe("flightAltitudeColor", () => {
  it("returns a Mapbox case/interpolate expression", () => {
    const ex = flightFeatureColorMapboxExpression();
    expect(Array.isArray(ex)).toBe(true);
    expect(ex[0]).toBe("case");
  });

  it("flat mode is case without interpolate branch", () => {
    const flat = flightFeatureFlatColorMapboxExpression();
    expect(flat[0]).toBe("case");
    expect(flat).not.toContain("interpolate");
  });

  it("ForAltitudeTint switches between full and flat", () => {
    const full = flightFeatureColorMapboxExpressionForAltitudeTint(true);
    const flat = flightFeatureColorMapboxExpressionForAltitudeTint(false);
    expect(JSON.stringify(full)).toContain("interpolate");
    expect(JSON.stringify(flat)).not.toContain("interpolate");
  });

  it("builds a CSS linear-gradient for the legend", () => {
    const g = flightAltitudeLegendGradientCss();
    expect(g.startsWith("linear-gradient")).toBe(true);
  });
});
