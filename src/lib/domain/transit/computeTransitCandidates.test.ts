import { describe, expect, it } from "vitest";
import { getMoonPosition } from "@/lib/domain/astro/moon";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import {
  destinationByAzimuthMeters,
  initialBearingDeg,
} from "@/lib/domain/geometry/wgs84";
import { computeConfirmedTransitFlightIds } from "./computeConfirmedTransitFlightIds";
import { computeTransitCandidates } from "./computeTransitCandidates";
import { AstroService } from "@/lib/domain/astro/astroService";
import type { FlightState } from "@/types/flight";

const observer = { lat: 45.8, lng: 15.98, groundHeightMeters: 0 };

// Mjesec visoko (alt 54.4°) — optimalan; vidi probe u sesiji.
const MOON_UP = new Date("2019-01-15T18:00:00.000Z");
// Mjesec duboko ispod horizonta (alt -35.8°) — ispod CRITICAL_BELOW_DEG.
const MOON_DOWN = new Date("2019-01-15T06:00:00.000Z");

const flight: FlightState = {
  id: "abc123",
  position: { lat: 45.9, lng: 15.98 },
  baroAltitudeMeters: null,
  geoAltitudeMeters: 10_000,
  groundSpeedMps: 200,
  trackDeg: 90,
  timestamp: MOON_UP.getTime(),
};

const baseArgs = {
  observer,
  focalLengthMm: 600,
  sensorType: "fullFrame" as const,
  wallNowMs: MOON_UP.getTime(),
  latencySkewMs: 0,
};

describe("computeTransitCandidates", () => {
  it.each([null, NaN, 0])("excludes candidates with unavailable speed (%s)", (speed) => {
    expect(computeTransitCandidates({ ...baseArgs, at: MOON_UP,
      flights: [{...flight, groundSpeedMps:speed}] })).toEqual([]);
  });
  it("returns empty when there are no flights", () => {
    expect(
      computeTransitCandidates({ ...baseArgs, flights: [], at: MOON_UP })
    ).toEqual([]);
  });

  it("returns empty when the moon is below the critical altitude", () => {
    expect(
      computeTransitCandidates({
        ...baseArgs,
        flights: [flight],
        at: MOON_DOWN,
        wallNowMs: MOON_DOWN.getTime(),
      })
    ).toEqual([]);
  });

  describe("avion izvan 100 km koji tek stiže do tranzita", () => {
    const LEAD_SEC = 240;

    /** Prvi trenutak nakon `from` kad je Mjesec nisko, pa je tranzit dalek. */
    function lowMoonAt(from: Date): Date {
      for (let min = 0; min < 24 * 60; min++) {
        const at = new Date(from.getTime() + min * 60_000);
        const { altitudeDeg } = getMoonPosition(at, observer.lat, observer.lng, 0);
        if (altitudeDeg >= 9 && altitudeDeg <= 10) return at;
      }
      throw new Error("Mjesec nije pronađen nisko");
    }

    /**
     * Let koji za `LEAD_SEC` prolazi točno preko Mjeseca, `transitKm` tlocrtno od
     * promatrača, a sada je `startKm` daleko. Mjesec se za to vrijeme pomakne
     * skoro 1°, pa se točka računa za budući položaj.
     */
    function flightTransitingAt(at: Date, transitKm: number, startKm: number): FlightState {
      const alignAt = new Date(at.getTime() + LEAD_SEC * 1000);
      const moon = getMoonPosition(alignAt, observer.lat, observer.lng, 0);
      const transit = destinationByAzimuthMeters(
        observer.lat, observer.lng, moon.azimuthDeg, transitKm * 1000
      );
      let lo = 1_000;
      let hi = 60_000;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const el = horizontalToPoint(observer, transit.lat, transit.lng, mid).altitudeDeg;
        if (el < moon.altitudeDeg) lo = mid;
        else hi = mid;
      }
      const start = destinationByAzimuthMeters(
        observer.lat, observer.lng, moon.azimuthDeg + 12, startKm * 1000
      );
      const legMeters = greatCircleM(start, transit);
      return {
        id: "far",
        position: start,
        baroAltitudeMeters: null,
        geoAltitudeMeters: lo,
        groundSpeedMps: legMeters / LEAD_SEC,
        trackDeg: initialBearingDeg([start.lat, start.lng], [transit.lat, transit.lng]),
        timestamp: at.getTime(),
      };
    }

    function greatCircleM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
      const rad = Math.PI / 180;
      const h =
        Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
        Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
      return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
    }

    const at = lowMoonAt(MOON_UP);
    const args = { ...baseArgs, at, wallNowMs: at.getTime() };

    it("javlja tranzit ~4 min unaprijed, dok je avion još 130 km daleko", () => {
      const far = flightTransitingAt(at, 75, 130);
      const [candidate] = computeTransitCandidates({ ...args, flights: [far] });
      expect(candidate?.willTransit).toBe(true);
      expect((candidate.prediction!.alignmentAtMs - at.getTime()) / 1000).toBeCloseTo(LEAD_SEC, -1);

      const moon = AstroService.getMoonState(at, observer.lat, observer.lng, 0);
      expect(
        computeConfirmedTransitFlightIds(observer, moon, [far], at, at.getTime(), 0)
      ).toEqual(new Set(["far"]));
    });

    it("i dalje odbacuje tranzit koji bi se dogodio dalje od 100 km", () => {
      const tooFar = flightTransitingAt(at, 130, 180);
      expect(computeTransitCandidates({ ...args, flights: [tooFar] })).toEqual([]);

      const moon = AstroService.getMoonState(at, observer.lat, observer.lng, 0);
      expect(
        computeConfirmedTransitFlightIds(observer, moon, [tooFar], at, at.getTime(), 0).size
      ).toBe(0);
    });
  });
});
