import { describe, expect, it } from "vitest";
import { exponentialSmoothStep } from "./exponentialSmoothPosition";

describe("exponentialSmoothStep", () => {
  const prev = { lat: 45.0, lng: 16.0 };
  const target = { lat: 45.01, lng: 16.02 };

  it("ne mijenja poziciju kad je dtMs <= 0 (nema unatrag u vremenu)", () => {
    expect(exponentialSmoothStep(prev, target, 0, 900)).toEqual(prev);
    expect(exponentialSmoothStep(prev, target, -50, 900)).toEqual(prev);
  });

  it("nakon jedne tau konstante prijeđe ~63% puta prema meti", () => {
    const p = exponentialSmoothStep(prev, target, 900, 900);
    const frac = (p.lat - prev.lat) / (target.lat - prev.lat);
    expect(frac).toBeCloseTo(1 - Math.exp(-1), 5);
  });

  it("nakon puno vremena (dt >> tau) praktički stigne do mete", () => {
    const p = exponentialSmoothStep(prev, target, 20_000, 900);
    expect(p.lat).toBeCloseTo(target.lat, 6);
    expect(p.lng).toBeCloseTo(target.lng, 6);
  });

  it("uzastopni mali koraci konvergiraju prema meti bez preskakanja", () => {
    let p = prev;
    for (let i = 0; i < 20; i++) {
      p = exponentialSmoothStep(p, target, 80, 900);
    }
    // Nakon 1600ms (~1.78 tau) trebalo bi biti solidno blizu, ali strogo
    // između prev i target (monotoni prilaz, nema overshoota).
    expect(p.lat).toBeGreaterThan(prev.lat);
    expect(p.lat).toBeLessThan(target.lat);
    expect(p.lat - prev.lat).toBeGreaterThan(0.8 * (target.lat - prev.lat));
  });

  it("tauMs <= 0 vraća prev nepromijenjen", () => {
    expect(exponentialSmoothStep(prev, target, 500, 0)).toEqual(prev);
  });
});
