import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMoonState, getMoonPosition } from "@/lib/domain/astro/moon";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import {
  destinationByAzimuthMeters,
  initialBearingDeg,
} from "@/lib/domain/geometry/wgs84";
import type { TransitCandidate } from "@/types/transit";
import { NextTransitBoard } from "./NextTransitBoard";

const observer = { lat: 45.8, lng: 15.98, groundHeightMeters: 0 };
const at = new Date("2019-01-15T18:00:00Z");
const moon = getMoonState(at, observer.lat, observer.lng);

/** Let koji prolazi kroz stvarni smjer Mjeseca nakon `timeSec` (isto kao azimuthAlignment.test). */
function transitFlight(timeSec = 60) {
  const future = getMoonPosition(new Date(+at + timeSec * 1000), observer.lat, observer.lng);
  let bearing = future.azimuthDeg;
  let p = destinationByAzimuthMeters(observer.lat, observer.lng, bearing, 10_000);
  for (let i = 0; i < 5; i++) {
    const sky = horizontalToPoint(observer, p.lat, p.lng, 14_000);
    bearing += future.azimuthDeg - sky.azimuthDeg;
    p = destinationByAzimuthMeters(observer.lat, observer.lng, bearing, 10_000);
  }
  let lo = 0;
  let hi = 50_000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (horizontalToPoint(observer, p.lat, p.lng, mid).altitudeDeg < future.altitudeDeg) lo = mid;
    else hi = mid;
  }
  const start = destinationByAzimuthMeters(p.lat, p.lng, 270, 200 * timeSec);
  return {
    id: "ctn612",
    callSign: "CTN 612",
    aircraftType: "A320",
    position: start,
    geoAltitudeMeters: (lo + hi) / 2,
    baroAltitudeMeters: null,
    trackDeg: initialBearingDeg([start.lat, start.lng], [p.lat, p.lng]),
    groundSpeedMps: 200,
    timestamp: +at,
  };
}

function render(overrides: Partial<Parameters<typeof NextTransitBoard>[0]> = {}) {
  const flight = transitFlight();
  const candidate: TransitCandidate = {
    flight,
    separationDeg: 0.1,
    isPossibleTransit: true,
    elevationGapDeg: 0,
    willTransit: true,
    prediction: {
      alignmentAtMs: +at + 60_000,
      fixTimestampMs: +at,
      lat: flight.position.lat,
      lng: flight.position.lng,
      providerId: "localsdr",
    },
  };
  return renderToStaticMarkup(
    createElement(NextTransitBoard, {
      candidates: [candidate],
      selectedFlightId: null,
      onSelectFlight: () => {},
      observer,
      moon,
      showEphemeris: true,
      isPlanned: false,
      watchedFlightCount: 12,
      onOpenCandidates: () => {},
      ...overrides,
    })
  );
}

describe("NextTransitBoard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: at });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers when, which aircraft and whether the observer is on the line", () => {
    const html = render();
    expect(html).toContain("Disc transit");
    expect(html).toContain("Moon crossing in");
    expect(html).toContain("CTN 612");
    expect(html).toContain("Alignment");
    expect(html).toContain("Are you on the line?");
    expect(html).toContain("Show on map");
    expect(html).not.toContain("Open aim view");
  });

  it("says why there is nothing to show instead of a blank board", () => {
    expect(render({ candidates: [] })).toContain("No transit in the next 5 minutes");
    expect(render({ isPlanned: true })).toContain("Planning mode");
    expect(render({ showEphemeris: false })).toContain("Loading the sky");
  });

  it("draws nothing while the Moon is below the usable horizon", () => {
    const low = { ...moon, altitudeDeg: 2 };
    expect(render({ moon: low })).toBe("");
  });
});
