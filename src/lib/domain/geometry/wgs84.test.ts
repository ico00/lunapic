import { describe, expect, it } from "vitest";
import {
  destinationByAzimuthMeters,
  ecefToEnu,
  enuToHorizontalDeg,
  geodeticToEcef,
  toDeg,
  toRad,
} from "./wgs84";

describe("wgs84", () => {
  it("toRad / toDeg round-trip", () => {
    expect(toRad(180)).toBeCloseTo(Math.PI, 10);
    expect(toDeg(Math.PI)).toBeCloseTo(180, 10);
    expect(toDeg(toRad(45.5))).toBeCloseTo(45.5, 10);
  });

  it("destinationByAzimuthMeters: north increases latitude", () => {
    const { lat, lng } = destinationByAzimuthMeters(45, 16, 0, 1000);
    expect(lat).toBeGreaterThan(45);
    expect(lng).toBeCloseTo(16, 4);
  });

  it("destinationByAzimuthMeters: east increases longitude", () => {
    const { lat, lng } = destinationByAzimuthMeters(0, 16, 90, 1000);
    expect(lng).toBeGreaterThan(16);
    expect(lat).toBeCloseTo(0, 4);
  });

  it("geodeticToEcef: equator / prime meridian on ellipsoid", () => {
    const p = geodeticToEcef(0, 0, 0);
    expect(p.x).toBeCloseTo(6_378_137, 0);
    expect(p.y).toBeCloseTo(0, 3);
    expect(p.z).toBeCloseTo(0, 3);
  });

  it("ecefToEnu: difference along ECEF X at equator → East", () => {
    const a = geodeticToEcef(0, 0, 0);
    const b = geodeticToEcef(0, 0.01, 0);
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const enu = ecefToEnu(d, 0, 0);
    expect(enu.e).toBeGreaterThan(0);
    expect(Math.abs(enu.n)).toBeLessThan(1);
  });

  it("enuToHorizontalDeg: pure North is azimuth 0", () => {
    const h = enuToHorizontalDeg(0, 1, 0);
    expect(h.azimuthDeg).toBeCloseTo(0, 5);
    expect(h.altitudeDeg).toBeCloseTo(0, 5);
  });

  it("enuToHorizontalDeg: pure East is azimuth 90", () => {
    const h = enuToHorizontalDeg(1, 0, 0);
    expect(h.azimuthDeg).toBeCloseTo(90, 5);
  });

  it("enuToHorizontalDeg: zenith", () => {
    const h = enuToHorizontalDeg(0, 0, 1);
    expect(h.altitudeDeg).toBeCloseTo(90, 5);
  });
});
