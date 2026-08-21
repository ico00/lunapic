import { describe, expect, it } from "vitest";
import type { RoutePoint } from "@/lib/db/flightLogDb";
import { meanTrackAroundApproach, type AnchoredSession } from "./callsignSchedule";

const ANCHOR_MS = Date.UTC(2026, 7, 21, 18, 0, 0);
const OFFSETS = [-60, -45, -30, -15, 0, 15, 30, 45, 60];

/** A straight eastbound track through `lat`, one point every 15 s. */
function session(lat: number, fromSec: number, toSec: number): AnchoredSession {
  const points: RoutePoint[] = [];
  for (let t = fromSec; t <= toSec; t += 15) {
    points.push({
      lat,
      lng: 16 + t * 0.001,
      alt_baro_m: 3000,
      logged_at: ANCHOR_MS + t * 1000,
    });
  }
  return { points, anchorMs: ANCHOR_MS };
}

describe("meanTrackAroundApproach", () => {
  it("averages the sessions that cover the anchor", () => {
    const track = meanTrackAroundApproach(
      [session(45.0, -60, 60), session(45.2, -60, 60), session(45.4, -60, 60)],
      OFFSETS,
      3
    );
    expect(track).toHaveLength(OFFSETS.length);
    for (const sample of track) {
      expect(sample.lat).toBeCloseTo(45.2, 6);
      expect(sample.sessionCount).toBe(3);
    }
  });

  it("keeps a fixed population so the mean never steps sideways", () => {
    // Two sessions span the window; a third, 1° away, only exists after +15 s.
    // Letting it join mid-window would jerk the mean north by ~0.3°.
    const track = meanTrackAroundApproach(
      [session(45.0, -60, 60), session(45.2, -60, 60), session(46.0, 15, 60)],
      OFFSETS,
      2
    );
    expect(track).toHaveLength(OFFSETS.length);
    const lats = track.map((s) => s.lat);
    expect(Math.max(...lats) - Math.min(...lats)).toBeLessThan(1e-6);
    for (const sample of track) {
      expect(sample.sessionCount).toBe(2);
    }
  });

  it("truncates the window at the first gap instead of jumping across it", () => {
    // One member stops reporting after +15 s: the window must end there.
    const track = meanTrackAroundApproach(
      [session(45.0, -60, 60), session(45.2, -60, 60), session(45.4, -60, 15)],
      OFFSETS,
      3
    );
    expect(track.map((s) => s.offsetSec)).toEqual([-60, -45, -30, -15, 0, 15]);
  });

  it("reports the scatter of the population as the spread", () => {
    const track = meanTrackAroundApproach(
      [session(45.0, -60, 60), session(45.2, -60, 60)],
      OFFSETS,
      2
    );
    // ±0.1° of latitude around the mean ≈ 11.1 km RMS.
    expect(track[0]!.spreadMeters).toBeCloseTo(11_132, -2);
  });

  it("returns nothing when too few sessions cover the anchor", () => {
    expect(
      meanTrackAroundApproach([session(45.0, -60, 60), session(45.2, 30, 60)], OFFSETS, 2)
    ).toEqual([]);
  });
});
