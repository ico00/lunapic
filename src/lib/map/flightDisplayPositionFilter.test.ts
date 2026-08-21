import { describe, expect, it } from "vitest";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import { destinationByAzimuthMeters } from "@/lib/domain/geometry/wgs84";
import { advanceDisplayPosition } from "./flightDisplayPositionFilter";

const START = { lat: 45.8, lng: 16.0 };
const EAST = 90;
const V = 200; // m/s
const TICK_MS = 80;

describe("advanceDisplayPosition", () => {
  it("ne pomiče marker unatrag ni kad meta zaostane iza njega (2026-08-21 regresija)", () => {
    const prev = { ...START, atMs: 1_000 };
    // Novi raw fix je stigao zakašnjelo pa meta leži 1.5 km IZA markera.
    const target = destinationByAzimuthMeters(START.lat, START.lng, 270, 1_500);

    const next = advanceDisplayPosition({
      prev,
      target,
      trackDeg: EAST,
      groundSpeedMps: V,
      nowMs: prev.atMs + TICK_MS,
    });

    // Kretanje je i dalje prema istoku (naprijed po traku), ne prema meti.
    expect(next.lng).toBeGreaterThan(prev.lng);
  });

  it("i kroz dužu seriju tickova s metom iza sebe ostaje monoton (nikad unatrag)", () => {
    let cur = { ...START, atMs: 1_000 };
    const target = destinationByAzimuthMeters(START.lat, START.lng, 270, 1_500);

    for (let i = 0; i < 50; i++) {
      const next = advanceDisplayPosition({
        prev: cur,
        target,
        trackDeg: EAST,
        groundSpeedMps: V,
        nowMs: cur.atMs + TICK_MS,
      });
      expect(next.lng).toBeGreaterThan(cur.lng);
      cur = next;
    }
  });

  it("neto pomak po ticku je barem (1 - maxKorekcija) * v * dt", () => {
    const prev = { ...START, atMs: 1_000 };
    const target = destinationByAzimuthMeters(START.lat, START.lng, 270, 1_500);
    const next = advanceDisplayPosition({
      prev,
      target,
      trackDeg: EAST,
      groundSpeedMps: V,
      nowMs: prev.atMs + TICK_MS,
    });

    const stepM = V * (TICK_MS / 1000); // 16 m
    const movedM = greatCircleDistanceMeters(prev.lat, prev.lng, next.lat, next.lng);
    expect(movedM).toBeGreaterThan(0.5 * stepM * 0.99);
  });

  it("sustiže metu koja je ispred i putuje istom brzinom (kao prava ekstrapolacija)", () => {
    let cur = { ...START, atMs: 1_000 };
    // Meta kreće 400 m ispred markera i — kao `extrapolateFlightForDisplay` —
    // i sama napreduje duž traka svakim tickom.
    let target = destinationByAzimuthMeters(START.lat, START.lng, EAST, 400);
    const initialErrM = greatCircleDistanceMeters(
      cur.lat,
      cur.lng,
      target.lat,
      target.lng
    );

    for (let i = 0; i < 200; i++) {
      cur = advanceDisplayPosition({
        prev: cur,
        target,
        trackDeg: EAST,
        groundSpeedMps: V,
        nowMs: cur.atMs + TICK_MS,
      });
      target = destinationByAzimuthMeters(
        target.lat,
        target.lng,
        EAST,
        V * (TICK_MS / 1000)
      );
    }

    // Preostaje najviše jedan pomak mete (u petlji se meta pomiče NAKON
    // markera, pa je taj zadnji korak po konstrukciji još nenadoknađen) —
    // početnih 400 m zaostatka je time praktički zatvoreno.
    const stepM = V * (TICK_MS / 1000);
    const errM = greatCircleDistanceMeters(cur.lat, cur.lng, target.lat, target.lng);
    expect(errM).toBeLessThanOrEqual(stepM + 0.01);
    expect(errM).toBeLessThan(initialErrM);
  });

  it("skače odmah kad je pogreška prevelika za sustizanje (novi avion / promjena izvora)", () => {
    const prev = { ...START, atMs: 1_000 };
    const target = destinationByAzimuthMeters(START.lat, START.lng, EAST, 50_000);

    const next = advanceDisplayPosition({
      prev,
      target,
      trackDeg: EAST,
      groundSpeedMps: V,
      nowMs: prev.atMs + TICK_MS,
    });

    expect(next.lat).toBeCloseTo(target.lat, 9);
    expect(next.lng).toBeCloseTo(target.lng, 9);
  });

  it("bez traka pada na blago glađenje prema meti", () => {
    const prev = { ...START, atMs: 1_000 };
    const target = { lat: START.lat + 0.01, lng: START.lng + 0.01 };

    const next = advanceDisplayPosition({
      prev,
      target,
      trackDeg: null,
      groundSpeedMps: null,
      nowMs: prev.atMs + 900, // jedna tau konstanta
    });

    const frac = (next.lat - prev.lat) / (target.lat - prev.lat);
    expect(frac).toBeCloseTo(1 - Math.exp(-1), 5);
  });

  it("dt <= 0 vraća prethodnu poziciju nepromijenjenu", () => {
    const prev = { ...START, atMs: 1_000 };
    const target = { lat: 46, lng: 17 };
    expect(
      advanceDisplayPosition({
        prev,
        target,
        trackDeg: EAST,
        groundSpeedMps: V,
        nowMs: prev.atMs,
      })
    ).toEqual(prev);
  });
});
