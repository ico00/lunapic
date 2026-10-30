import { describe, expect, it } from "vitest";
import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import { detectRunwayInUse, RUNWAY_IN_USE_WINDOW_MS, type RunwayUseSample } from "./runwayInUse";

const NOW = 1_800_000_000_000;
const MID = { lat: 45.7418, lng: 16.0672 };

/** Sample `km` south-west (−) or north-east (+) of the runway, on the centreline. */
function onAxis(icao24: string, km: number, trackDeg: number, over: Partial<RunwayUseSample> = {}): RunwayUseSample {
  const p = destinationByAzimuthMeters(MID.lat, MID.lng, km < 0 ? 227 : 47, Math.abs(km) * 1000);
  return { icao24, lat: p.lat, lng: p.lng, altM: 500, trackDeg, loggedAt: NOW - 60_000, ...over };
}

describe("detectRunwayInUse", () => {
  it("reads north-east traffic as runway 04, landing and take-off alike", () => {
    const r = detectRunwayInUse([onAxis("a", -6, 47), onAxis("b", 4, 45), onAxis("c", -3, 50)], NOW);
    expect(r).toMatchObject({ runway: "04", aircraft04: 3, aircraft22: 0 });
  });

  it("reads south-west traffic as runway 22", () => {
    const r = detectRunwayInUse([onAxis("a", 6, 227), onAxis("b", -4, 225)], NOW);
    expect(r).toMatchObject({ runway: "22", aircraft22: 2 });
  });

  it("counts an aircraft once, however many fixes it logged", () => {
    expect(detectRunwayInUse([onAxis("a", -6, 47), onAxis("a", -5, 47), onAxis("a", -4, 47)], NOW).aircraft04).toBe(1);
  });

  it("does not decide from one aircraft", () => {
    const r = detectRunwayInUse([onAxis("a", -6, 47)], NOW);
    expect(r.runway).toBeNull();
    expect(r.aircraft04).toBe(1);
  });

  it("does not decide while the direction is changing", () => {
    const r = detectRunwayInUse([onAxis("a", -6, 47), onAxis("b", -5, 47), onAxis("c", 5, 227), onAxis("d", 4, 227)], NOW);
    expect(r.runway).toBeNull();
  });

  it("tolerates one odd aircraft among many", () => {
    const r = detectRunwayInUse(
      [onAxis("a", -6, 47), onAxis("b", -5, 47), onAxis("c", -4, 47), onAxis("d", -3, 47), onAxis("e", 5, 227)],
      NOW
    );
    expect(r.runway).toBe("04");
  });

  it.each([
    ["too high", onAxis("x", -6, 47, { altM: 3_000 })],
    ["off the axis", { ...onAxis("x", -6, 47), lat: MID.lat + 0.1 }],
    ["crossing the axis", onAxis("x", -6, 137)],
    ["too far out", onAxis("x", -30, 47)],
    ["older than the window", onAxis("x", -6, 47, { loggedAt: NOW - RUNWAY_IN_USE_WINDOW_MS - 1 })],
    ["without a track", onAxis("x", -6, 47, { trackDeg: null })],
    ["without a height", onAxis("x", -6, 47, { altM: null })],
  ])("ignores a sample %s", (_name, sample) => {
    expect(detectRunwayInUse([sample], NOW)).toMatchObject({ aircraft04: 0, aircraft22: 0, lastSeenMs: null });
  });

  it("reports when the latest evidence was seen", () => {
    expect(detectRunwayInUse([onAxis("a", -6, 47, { loggedAt: NOW - 240_000 })], NOW).lastSeenMs).toBe(NOW - 240_000);
  });
});
