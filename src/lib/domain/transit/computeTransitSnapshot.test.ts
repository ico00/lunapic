import { describe, expect, it } from "vitest";
import { AstroService } from "@/lib/domain/astro/astroService";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import { computeTransitSnapshot } from "@/lib/domain/transit/computeTransitSnapshot";
import type { FlightState } from "@/types/flight";

const observer = { lat: 45.8, lng: 16.0, groundHeightMeters: 100 };
const HOUR_MS = 3_600_000;

function moonAt(ms: number) {
  return AstroService.getMoonState(new Date(ms), observer.lat, observer.lng, observer.groundHeightMeters);
}

/** Prvi puni sat u kojem je Mjesec visoko i bit će i dalje iznad horizonta za 4 h. */
function instantWithMoonUp(): number {
  for (let t = Date.UTC(2026, 9, 31); ; t += HOUR_MS) {
    if (moonAt(t).altitudeDeg > 35 && moonAt(t + 4 * HOUR_MS).altitudeDeg > 10) return t;
  }
}

/** Avion točno ispred Mjeseca u trenutku `nowMs`, s pozicijom svježom u tom trenutku. */
function aircraftOnMoon(nowMs: number): FlightState {
  const moon = moonAt(nowMs);
  const position = destinationByAzimuthMeters(observer.lat, observer.lng, moon.azimuthDeg, 12_000);
  let low = 0;
  let high = 40_000;
  for (let i = 0; i < 30; i += 1) {
    const mid = (low + high) / 2;
    const ac = horizontalToPoint(observer, position.lat, position.lng, mid);
    if (ac.altitudeDeg < moon.altitudeDeg) low = mid;
    else high = mid;
  }
  return {
    id: "on-moon",
    callSign: "ONMOON",
    position,
    geoAltitudeMeters: low,
    baroAltitudeMeters: null,
    groundSpeedMps: null,
    trackDeg: null,
    timestamp: nowMs,
  };
}

function snapshot(nowMs: number, overrides: { referenceEpochMs?: number; isPlanned?: boolean } = {}) {
  return computeTransitSnapshot({
    observer,
    focalLengthMm: 600,
    sensorType: "fullFrame",
    flights: [aircraftOnMoon(nowMs)],
    referenceEpochMs: overrides.referenceEpochMs ?? nowMs,
    wallNowMs: nowMs,
    latencySkewMs: 0,
    isPlanned: overrides.isPlanned ?? false,
  });
}

describe("computeTransitSnapshot", () => {
  const nowMs = instantWithMoonUp();

  it("finds the live transit in sync with the wall clock", () => {
    const s = snapshot(nowMs);
    expect(s.activeTransits.map((r) => r.flight.id)).toEqual(["on-moon"]);
    expect([...s.shotFeasibleFlightIds]).toEqual(["on-moon"]);
  });

  it("a slider left hours ahead neither hides nor invents live transits", () => {
    const scrubbed = snapshot(nowMs, { referenceEpochMs: nowMs + 4 * HOUR_MS });
    expect(scrubbed.activeTransits.map((r) => r.flight.id)).toEqual(["on-moon"]);
    expect([...scrubbed.shotFeasibleFlightIds]).toEqual(["on-moon"]);
    expect(scrubbed.liveMoon).toEqual(moonAt(nowMs));
  });

  it("the slider still moves the displayed Moon", () => {
    const scrubbed = snapshot(nowMs, { referenceEpochMs: nowMs + 4 * HOUR_MS });
    expect(scrubbed.moon).toEqual(moonAt(nowMs + 4 * HOUR_MS));
    expect(scrubbed.moon.azimuthDeg).not.toBeCloseTo(scrubbed.liveMoon.azimuthDeg, 0);
  });

  it("a stale slider anchor does not lag the live Moon", () => {
    const later = snapshot(nowMs, { referenceEpochMs: nowMs - 30_000 });
    expect(later.liveMoon).toEqual(moonAt(nowMs));
  });

  it("planning a future date turns off everything live", () => {
    const planned = snapshot(nowMs, { isPlanned: true });
    expect(planned.candidates).toEqual([]);
    expect(planned.activeTransits).toEqual([]);
    expect(planned.shotFeasibleFlightIds.size).toBe(0);
    expect(planned.confirmedTransitFlightIds.size).toBe(0);
  });
});
