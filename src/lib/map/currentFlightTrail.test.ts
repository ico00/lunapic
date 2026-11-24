import { describe, expect, it } from "vitest";
import { currentFlightTrail, FLIGHT_BREAK_MS } from "./currentFlightTrail";

const seg = (id: string, fromMs: number, toMs: number) => ({
  type: "Feature" as const,
  id,
  properties: { fromMs, toMs },
  geometry: { type: "LineString" as const, coordinates: [] as number[][] },
});
const fc = (...features: ReturnType<typeof seg>[]) => ({
  type: "FeatureCollection" as const,
  features,
});
const ids = (r: { features: readonly { id: string }[] }) => r.features.map((f) => f.id);
const MIN = 60_000;

describe("currentFlightTrail", () => {
  it("drops the previous flight of the same airframe (RYR7BP, 2026-11-24)", () => {
    // Real /track/4caf29 response: inbound to Budapest, 87 min gap, outbound.
    const now = 1795548119060 + 10_000;
    const r = currentFlightTrail(
      fc(seg("inbound", 1795541006406, 1795542519347), seg("outbound", 1795547740427, 1795548119060)),
      now
    );
    expect(ids(r)).toEqual(["outbound"]);
  });

  it("keeps segments of one flight split by a short coverage gap", () => {
    const now = 100 * MIN;
    const r = currentFlightTrail(
      fc(seg("a", 10 * MIN, 40 * MIN), seg("b", 48 * MIN, 99 * MIN)),
      now
    );
    expect(ids(r)).toEqual(["a", "b"]);
  });

  it("shows nothing when the only logged segments ended long ago", () => {
    const now = 200 * MIN;
    const r = currentFlightTrail(fc(seg("old", 10 * MIN, 60 * MIN)), now);
    expect(r.features).toEqual([]);
  });

  it("cuts exactly at the flight break", () => {
    const now = 100 * MIN;
    const atBreak = currentFlightTrail(
      fc(seg("a", 0, 50 * MIN), seg("b", 50 * MIN + FLIGHT_BREAK_MS, 99 * MIN)),
      now
    );
    expect(ids(atBreak)).toEqual(["a", "b"]);
    const past = currentFlightTrail(
      fc(seg("a", 0, 50 * MIN), seg("b", 50 * MIN + FLIGHT_BREAK_MS + 1, 99 * MIN)),
      now
    );
    expect(ids(past)).toEqual(["b"]);
  });
});
