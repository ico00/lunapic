import { describe, expect, it } from "vitest";
import { DEFAULT_OBSERVER_LOCATION as observer } from "@/lib/defaultObserverLocation";
import { getMoonState } from "@/lib/domain/astro/moon";
import { photographerPack } from "@/lib/domain/geometry/geometryEnginePhotographer";
import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import type { DisplayFix } from "@/lib/map/flightDisplayPositionFilter";
import type { FlightState } from "@/types/flight";
import { computeDisplayFlights } from "./useExtrapolatedFlightsForMap";

const at = new Date("2026-09-20T18:30:53Z");
const shownPosition = { lat: 45.490, lng: 15.863 };
// Reconstructed from the rounded screenshot values, not a captured ADS-B fix.
// At the default observer, 81.25 s farther along the track matches both
// Photographer readings (51.40 km / 0.218°/s), after azimuth alignment.
const flight: FlightState = {
  id: "407cb2",
  icao24: "407cb2",
  callSign: "RUK530X",
  position: destinationByAzimuthMeters(45.490, 15.863, 128.7, 474 * 0.514444 * 81.25),
  geoAltitudeMeters: 11163,
  baroAltitudeMeters: 10660,
  groundSpeedMps: 474 * 0.514444,
  trackDeg: 128.7,
  timestamp: +at,
};

function laggingDisplay() {
  return new Map<string, DisplayFix>([
    [flight.id, { ...shownPosition, atMs: +at - 80 }],
  ]);
}

describe("selected flight display agrees with Photographer", () => {
  it("does not display a future crossing when the authoritative fix has passed it", () => {
    const moon = getMoonState(at, observer.lat, observer.lng, observer.groundHeightMeters);
    const pack = photographerPack(observer, flight, moon, at)!;
    expect(pack.kin.slantRangeMeters / 1000).toBeCloseTo(51.40, 2);
    expect(pack.kin.absAzimuthRateDegPerSec).toBeCloseTo(0.218, 3);
    expect(pack.timeToAlignmentSec).toBeNull();

    // Demonstrate the old catch-up discrepancy: the same raw fix can still
    // look ~70 s BEFORE alignment when routed through ordinary smoothing.
    const [smoothed] = computeDisplayFlights([flight], 0, +at, laggingDisplay(), null);
    expect(photographerPack(observer, smoothed, moon, at)!.timeToAlignmentSec).toBeGreaterThan(60);

    const state = laggingDisplay();
    const [selected] = computeDisplayFlights([flight], 0, +at, state, flight.id);
    expect(selected.position).toEqual(flight.position);
    expect(photographerPack(observer, selected, moon, at)!.timeToAlignmentSec).toBeNull();
    expect(state.get(flight.id)).toEqual({ ...flight.position, atMs: +at });
  });

  it("continues animating the selected flight with the same extrapolation and skew as the countdown", () => {
    const state = laggingDisplay();
    for (const dt of [0, 100, 1000, 5000]) {
      const now = +at + dt;
      const [selected] = computeDisplayFlights([flight], 2000, now, state, flight.id);
      expect(selected).toEqual(extrapolateFlightForDisplay(flight, now, 2000));
    }
    // Clearing the selection starts smoothing from the corrected position.
    const [unselected] = computeDisplayFlights([flight], 2000, +at + 5080, state, null);
    expect(unselected.position.lat).toBeCloseTo(
      extrapolateFlightForDisplay(flight, +at + 5080, 2000).position.lat, 6
    );
  });
});
