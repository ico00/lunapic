import { describe, expect, it } from "vitest";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import { initialBearingDeg } from "@/lib/domain/geometry/wgs84";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import type { FlightState } from "@/types/flight";
import {
  advanceDisplayPosition,
  type DisplayFix,
} from "./flightDisplayPositionFilter";

/**
 * Stvarni snimak s produkcije (2026-08-21, `GET /api/avionix/aircraft`, avion
 * `8940c3` u ravnom letu na 445 kt / kurs 117°). Šest uzastopnih pollova ~11 s
 * razmaka — točno slučaj koji je korisnik prijavio.
 *
 * Patologija je vidljiva golim okom: između 3. i 5. polla avion prijeđe samo
 * ~1.2 km umjesto očekivanih ~2.5 km (uređaj je javio zakašnjeli fix, ali ga je
 * pečatirao kao "sad"), pa u sljedećem pollu "nadoknadi" ~3.4 km. Kako
 * `extrapolateFlightForDisplay` u međuvremenu dead-reckona naprijed punom
 * brzinom, dolazak zakašnjelog fixa povuče metu UNATRAG za tu razliku.
 */
const REAL_POLLS: readonly {
  readonly tsMs: number;
  readonly lat: number;
  readonly lng: number;
  readonly speedKt: number;
  readonly headingDeg: number;
}[] = [
  { tsMs: 1787312100164, lat: 45.698135, lng: 16.005941, speedKt: 445, headingDeg: 117 },
  { tsMs: 1787312111164, lat: 45.687902, lng: 16.034889, speedKt: 445, headingDeg: 117 },
  { tsMs: 1787312122165, lat: 45.677614, lng: 16.063934, speedKt: 445, headingDeg: 117 },
  { tsMs: 1787312133166, lat: 45.672773, lng: 16.07753, speedKt: 446, headingDeg: 117 },
  { tsMs: 1787312144167, lat: 45.6589, lng: 16.1166, speedKt: 446, headingDeg: 117 },
];

const KNOTS_TO_MPS = 0.514444;
const TICK_MS = 80;

function flightAt(pollIndex: number): FlightState {
  const p = REAL_POLLS[pollIndex];
  return {
    id: "8940c3",
    icao24: "8940c3",
    position: { lat: p.lat, lng: p.lng },
    groundSpeedMps: p.speedKt * KNOTS_TO_MPS,
    trackDeg: p.headingDeg,
    timestamp: p.tsMs,
  } as FlightState;
}

/** Indeks zadnjeg polla koji je stigao do trenutka `nowMs`. */
function pollIndexAt(nowMs: number): number {
  let idx = 0;
  for (let i = 0; i < REAL_POLLS.length; i++) {
    if (REAL_POLLS[i].tsMs <= nowMs) idx = i;
  }
  return idx;
}

/** Je li korak `a → b` unatrag u odnosu na kurs (kut > 90° od traka)? */
function isBackwardStep(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  trackDeg: number
): boolean {
  if (greatCircleDistanceMeters(a.lat, a.lng, b.lat, b.lng) < 0.01) return false;
  const bearing = initialBearingDeg([a.lat, a.lng], [b.lat, b.lng]);
  // Predznačena razlika kuta u [-180, 180); |razlika| > 90° znači da korak ima
  // negativnu projekciju na kurs, tj. avion se pomaknuo unatrag.
  const diff = Math.abs(((bearing - trackDeg + 540) % 360) - 180);
  return diff > 90;
}

const START_MS = REAL_POLLS[0].tsMs;
const END_MS = REAL_POLLS[REAL_POLLS.length - 1].tsMs + 5_000;

describe("advanceDisplayPosition nad stvarnim avionix feedom (2026-08-21)", () => {
  it("sirova meta (ponašanje bez filtera) STVARNO ide unatrag — dokaz da snimak sadrži bug", () => {
    let backwardSteps = 0;
    let maxBackwardM = 0;
    let prev: { lat: number; lng: number } | null = null;

    for (let now = START_MS; now <= END_MS; now += TICK_MS) {
      const f = flightAt(pollIndexAt(now));
      const target = extrapolateFlightForDisplay(f, now, 0).position;
      if (prev && isBackwardStep(prev, target, 117)) {
        backwardSteps++;
        maxBackwardM = Math.max(
          maxBackwardM,
          greatCircleDistanceMeters(prev.lat, prev.lng, target.lat, target.lng)
        );
      }
      prev = target;
    }

    expect(backwardSteps).toBeGreaterThan(0);
    // Skok unatrag reda veličine kilometra — točno ono što se vidi na karti.
    expect(maxBackwardM).toBeGreaterThan(500);
  });

  it("kroz filter marker se NIJEDNOM ne pomakne unatrag", () => {
    let display: DisplayFix | null = null;
    let backwardSteps = 0;

    for (let now = START_MS; now <= END_MS; now += TICK_MS) {
      const f = flightAt(pollIndexAt(now));
      const target = extrapolateFlightForDisplay(f, now, 0).position;

      if (!display) {
        display = { lat: target.lat, lng: target.lng, atMs: now };
        continue;
      }
      const next = advanceDisplayPosition({
        prev: display,
        target,
        trackDeg: f.trackDeg ?? null,
        groundSpeedMps: f.groundSpeedMps ?? null,
        nowMs: now,
      });
      if (isBackwardStep(display, next, 117)) backwardSteps++;
      display = next;
    }

    expect(backwardSteps).toBe(0);
  });

  it("filter i dalje prati stvarnu poziciju (ne odluta od zadnjeg fixa)", () => {
    let display: DisplayFix | null = null;

    for (let now = START_MS; now <= END_MS; now += TICK_MS) {
      const f = flightAt(pollIndexAt(now));
      const target = extrapolateFlightForDisplay(f, now, 0).position;
      if (!display) {
        display = { lat: target.lat, lng: target.lng, atMs: now };
        continue;
      }
      display = advanceDisplayPosition({
        prev: display,
        target,
        trackDeg: f.trackDeg ?? null,
        groundSpeedMps: f.groundSpeedMps ?? null,
        nowMs: now,
      });
    }

    const last = REAL_POLLS[REAL_POLLS.length - 1];
    const vMps = last.speedKt * KNOTS_TO_MPS;
    // Na kraju je od zadnjeg fixa prošlo 5 s → očekujemo ~5 s leta ispred njega.
    const aheadM = greatCircleDistanceMeters(
      last.lat,
      last.lng,
      display!.lat,
      display!.lng
    );
    expect(aheadM).toBeGreaterThan(0);
    expect(aheadM).toBeLessThan(vMps * 20);
  });
});
