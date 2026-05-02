import { describe, expect, it } from "vitest";

import { mergeLiveFlightLists, mergeTwoLiveFlightSnapshots } from "./mergeLiveFlightLists";
import type { FlightState } from "@/types/flight";

const base = (id: string, ts: number, lat: number): FlightState => ({
  id,
  icao24: id,
  position: { lat, lng: 15 },
  baroAltitudeMeters: 10_000,
  geoAltitudeMeters: null,
  groundSpeedMps: 200,
  trackDeg: 90,
  timestamp: ts,
  originCountry: null,
  callSign: null,
});

describe("mergeTwoLiveFlightSnapshots", () => {
  it("prefers newer timestamp for position", () => {
    const older = base("abc123", 1000, 45);
    const newer = {
      ...base("abc123", 2000, 46),
      aircraftType: "B738",
    };
    const out = mergeTwoLiveFlightSnapshots(older, newer);
    expect(out.timestamp).toBe(2000);
    expect(out.position.lat).toBe(46);
    expect(out.aircraftType).toBe("B738");
  });

  it("fills metadata from older when newer lacks it", () => {
    const rich = {
      ...base("abc123", 2000, 46),
      aircraftType: "A320",
      airlineName: "Test Air",
    };
    const sparse = base("abc123", 3000, 47);
    const out = mergeTwoLiveFlightSnapshots(sparse, rich);
    expect(out.timestamp).toBe(3000);
    expect(out.position.lat).toBe(47);
    expect(out.aircraftType).toBe("A320");
    expect(out.airlineName).toBe("Test Air");
  });
});

describe("mergeLiveFlightLists", () => {
  it("dedupes by id across lists", () => {
    const a = [base("aa", 1000, 1), base("bb", 1000, 2)];
    const b = [base("aa", 1500, 3), base("cc", 1000, 4)];
    const out = mergeLiveFlightLists([a, b]);
    const ids = new Set(out.map((x) => x.id));
    expect(ids.size).toBe(3);
    expect(out.find((x) => x.id === "aa")?.position.lat).toBe(3);
  });

  it("dedupes same ICAO24 with different letter case", () => {
    const a = [base("4d0222", 1000, 45)];
    const b = [base("4D0222", 2000, 46)];
    const out = mergeLiveFlightLists([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("4d0222");
    expect(out[0]?.position.lat).toBe(46);
  });
});
