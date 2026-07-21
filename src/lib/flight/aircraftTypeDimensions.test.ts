import { describe, expect, it } from "vitest";
import { resolveAircraftDimensionsByTypecode } from "./aircraftTypeDimensions";

describe("resolveAircraftDimensionsByTypecode", () => {
  it("vraća točne dimenzije za poznate typecodove", () => {
    expect(resolveAircraftDimensionsByTypecode("A320")).toEqual({
      wingspanMeters: 35.8,
      lengthMeters: 37.6,
    });
    expect(resolveAircraftDimensionsByTypecode("B738")?.wingspanMeters).toBe(35.8);
    expect(resolveAircraftDimensionsByTypecode("DH8D")?.lengthMeters).toBe(32.8);
  });

  it("normalizira mala slova i razmake", () => {
    expect(resolveAircraftDimensionsByTypecode(" a21n ")?.lengthMeters).toBe(44.5);
  });

  it("nepoznata varijanta pada na obitelj po prefiksu", () => {
    // Ne postoji u tablici, ali je iz A320 obitelji.
    expect(resolveAircraftDimensionsByTypecode("A32X")?.wingspanMeters).toBe(35.8);
    expect(resolveAircraftDimensionsByTypecode("B78Z")?.wingspanMeters).toBe(60.1);
  });

  it("odbija ICAO category deskriptore (tuple[0] fallback u indeksu)", () => {
    expect(resolveAircraftDimensionsByTypecode("L2J")).toBeNull();
    expect(resolveAircraftDimensionsByTypecode("H1T")).toBeNull();
  });

  it("vraća null za prazno i potpuno nepoznato", () => {
    expect(resolveAircraftDimensionsByTypecode(null)).toBeNull();
    expect(resolveAircraftDimensionsByTypecode("")).toBeNull();
    expect(resolveAircraftDimensionsByTypecode("ZZZZ")).toBeNull();
  });

  it("GA avioni imaju realno male dimenzije (Cessna 172)", () => {
    const c172 = resolveAircraftDimensionsByTypecode("C172");
    expect(c172?.wingspanMeters).toBe(11.0);
    expect(c172?.lengthMeters).toBeLessThan(10);
  });
});
