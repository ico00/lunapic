import { describe, expect, it } from "vitest";
import { getMoonState } from "../astro/moon";
import { GeometryEngine } from "./geometryEngine";
import {
  aircraftLineOfSightKinematics,
  photographerPack,
} from "./geometryEnginePhotographer";

const observer = { lat: 45.8, lng: 15.98, groundHeightMeters: 0 };

const baseFlight = {
  position: { lat: 45.9, lng: 15.98 },
  id: "t" as const,
  baroAltitudeMeters: null as number | null,
  geoAltitudeMeters: 10_000,
  groundSpeedMps: 200,
  trackDeg: 90,
  timestamp: 0,
} as const;

describe("aircraftLineOfSightKinematics", () => {
  it("null when no altitude on flight", () => {
    const f = {
      ...baseFlight,
      baroAltitudeMeters: null,
      geoAltitudeMeters: null,
    };
    expect(aircraftLineOfSightKinematics(observer, f)).toBeNull();
  });

  it("null when ground speed is below 1 m/s (and not using defaults)", () => {
    const f = {
      ...baseFlight,
      groundSpeedMps: 0.2,
    };
    expect(aircraftLineOfSightKinematics(observer, f, 200, 90)).toBeNull();
  });

  it("returns kinematics for valid state", () => {
    const k = aircraftLineOfSightKinematics(observer, baseFlight);
    expect(k).not.toBeNull();
    expect(k!.slantRangeMeters).toBeGreaterThan(0);
    expect(k!.horizontalRangeMeters).toBeGreaterThan(0);
  });
});

describe("photographerPack", () => {
  it("null when no altitude", () => {
    const f = { ...baseFlight, baroAltitudeMeters: null, geoAltitudeMeters: null };
    const moon = getMoonState(new Date("2019-01-15T12:00:00.000Z"), 45.8, 15.98);
    expect(photographerPack(observer, f, moon, new Date("2019-01-15T12:00:00.000Z"))).toBeNull();
  });

  it("returns pack with expected keys when valid", () => {
    const moon = getMoonState(new Date("2019-01-15T12:00:00.000Z"), observer.lat, observer.lng);
    const pack = photographerPack(observer, baseFlight, moon, new Date("2019-01-15T12:00:00.000Z"));
    expect(pack).not.toBeNull();
    expect(pack!.kin).toBeDefined();
    expect(typeof pack!.acAz).toBe("number");
    expect(typeof pack!.moAz).toBe("number");
    expect(typeof pack!.gapDeg).toBe("number");
  });
});

describe("GeometryEngine facade (photography)", () => {
  it("delegates to same helpers", () => {
    const k1 = aircraftLineOfSightKinematics(observer, baseFlight);
    const k2 = GeometryEngine.aircraftLineOfSightKinematics(observer, baseFlight);
    expect(k1?.slantRangeMeters).toBeCloseTo(k2?.slantRangeMeters ?? NaN, 3);
  });
});
