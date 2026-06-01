import { describe, expect, it } from "vitest";

import {
  FLIGHT_ALTITUDE_LEGEND_STOPS,
  flightAltitudeLegendGradientCss,
  flightAltitudeLegendStopLabel,
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

  it("legend tick labels match km presets and compact ft thousands", () => {
    const stops = FLIGHT_ALTITUDE_LEGEND_STOPS;
    const last = stops.length - 1;
    expect(
      stops.map((s, i) =>
        flightAltitudeLegendStopLabel(s, "km", i === last)
      )
    ).toEqual(["0m", "1.5k", "4.6k", "7.6k", "10.7k", "13.7k+"]);
    expect(
      stops.map((s, i) =>
        flightAltitudeLegendStopLabel(s, "ft", i === last)
      )
    ).toEqual(["0", "5k", "15k", "25k", "35k", "45k+"]);
  });
});
