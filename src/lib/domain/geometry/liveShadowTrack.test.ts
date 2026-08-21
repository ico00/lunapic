import { describe, expect, it } from "vitest";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import type { FlightState } from "@/types/flight";
import { buildLiveShadowTrack, LIVE_SHADOW_HORIZON_SEC } from "./liveShadowTrack";

const NOW_MS = Date.UTC(2026, 4, 23, 19, 30, 0);

const FLIGHT: FlightState = {
  id: "abc123",
  position: { lat: 45.9, lng: 15.9 },
  baroAltitudeMeters: 11_000,
  geoAltitudeMeters: null,
  groundSpeedMps: 230,
  trackDeg: 90,
  timestamp: NOW_MS,
};

describe("buildLiveShadowTrack", () => {
  it("walks the spot across the ground for the full lookahead", () => {
    const track = buildLiveShadowTrack({
      flight: FLIGHT,
      nowMs: NOW_MS,
      groundHeightMeters: 120,
    })!;
    expect(track).not.toBeNull();
    expect(track.now?.offsetSec).toBe(0);
    expect(track.samples.at(-1)!.offsetSec).toBe(LIVE_SHADOW_HORIZON_SEC);

    // The spot tracks the aircraft, so over 300 s it should have moved roughly
    // as far as the aircraft does — same order, not the same number, because
    // the Moon moves too.
    const first = track.samples[0]!.spot;
    const last = track.samples.at(-1)!.spot;
    const travelled = greatCircleDistanceMeters(first.lat, first.lng, last.lat, last.lng);
    const aircraftTravelled = 230 * LIVE_SHADOW_HORIZON_SEC;
    expect(travelled).toBeGreaterThan(aircraftTravelled * 0.5);
    expect(travelled).toBeLessThan(aircraftTravelled * 1.5);
  });

  it("moves the spot toward the observer as coverage improves on descent", () => {
    const level = buildLiveShadowTrack({
      flight: FLIGHT,
      nowMs: NOW_MS,
      groundHeightMeters: 120,
    })!;
    const descending = buildLiveShadowTrack({
      flight: { ...FLIGHT, verticalRateFpm: -2000 },
      nowMs: NOW_MS,
      groundHeightMeters: 120,
    })!;
    // Losing ~3 km over the lookahead shortens the slant range, so the aircraft
    // covers more of the Moon from its spot.
    expect(descending.samples.at(-1)!.spot.coveragePercent).toBeGreaterThan(
      level.samples.at(-1)!.spot.coveragePercent
    );
  });

  it("returns a single sample when the flight has no usable trajectory", () => {
    const track = buildLiveShadowTrack({
      flight: { ...FLIGHT, groundSpeedMps: null, trackDeg: null },
      nowMs: NOW_MS,
      groundHeightMeters: 120,
    })!;
    expect(track.samples).toHaveLength(1);
    expect(track.now).not.toBeNull();
  });

  it("returns null without an altitude to work from", () => {
    expect(
      buildLiveShadowTrack({
        flight: { ...FLIGHT, baroAltitudeMeters: null, geoAltitudeMeters: null },
        nowMs: NOW_MS,
        groundHeightMeters: 120,
      })
    ).toBeNull();
  });

  it("returns null when the Moon is below the visibility floor", () => {
    expect(
      buildLiveShadowTrack({
        flight: FLIGHT,
        nowMs: NOW_MS + 12 * 3_600_000,
        groundHeightMeters: 120,
      })
    ).toBeNull();
  });
});
