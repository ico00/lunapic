import { describe, expect, it } from "vitest";

import {
  mergeLiveFlightLists,
  mergeLocalFeeds,
  mergeLocalFeedTickIntoPrevious,
  mergeTwoLiveFlightSnapshots,
} from "./mergeLiveFlightLists";
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

describe("mergeLocalFeeds — prioritet po svježini", () => {
  const NOW = 1_800_000_000_000;
  const local = (id: string, ts: number, lat: number): FlightState => ({
    ...base(id, ts, lat),
    providerId: "localsdr",
  });
  const avio = (id: string, ts: number, lat: number): FlightState => ({
    ...base(id, ts, lat),
    providerId: "avionix",
  });

  it("dok su oba svježa, localsdr vodi (fiksni tiebreak protiv treperenja)", () => {
    const out = mergeLocalFeeds(
      [local("aa", NOW - 2_000, 45)],
      [avio("aa", NOW - 1_000, 46)],
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].providerId).toBe("localsdr");
    expect(out[0].position.lat).toBe(45);
  });

  it("Pi fix stariji od praga prepušta avion Avionixu", () => {
    const out = mergeLocalFeeds(
      [local("aa", NOW - 45_000, 45)],
      [avio("aa", NOW - 1_000, 46)],
      NOW
    );
    expect(out[0].providerId).toBe("avionix");
    expect(out[0].position.lat).toBe(46);
  });

  it("position-only redak (bez track/brzine) prepušta vođenje, ali posudi metapodatke", () => {
    const positionOnly: FlightState = {
      ...local("aa", NOW - 1_000, 45),
      trackDeg: null,
      groundSpeedMps: null,
      aircraftType: "A320",
    };
    const out = mergeLocalFeeds([positionOnly], [avio("aa", NOW - 3_000, 46)], NOW);
    expect(out[0].providerId).toBe("avionix");
    expect(out[0].aircraftType).toBe("A320");
  });

  it("pobjednik bez kinematike posudi track/brzinu od drugog izvora", () => {
    const noKin: FlightState = {
      ...local("aa", NOW - 1_000, 45),
      trackDeg: null,
      groundSpeedMps: null,
    };
    const otherNoKin: FlightState = {
      ...avio("aa", NOW - 2_000, 46),
      trackDeg: 275,
      groundSpeedMps: 230,
      baroAltitudeMeters: null,
    };
    const out = mergeLocalFeeds([noKin], [otherNoKin], NOW);
    expect(out[0].trackDeg).toBe(275);
    expect(out[0].groundSpeedMps).toBe(230);
  });

  it("avion koji vidi samo jedan prijemnik prolazi nepromijenjen", () => {
    const out = mergeLocalFeeds(
      [local("aa", NOW, 45)],
      [avio("bb", NOW, 46)],
      NOW
    );
    expect(out.map((f) => f.id).sort()).toEqual(["aa", "bb"]);
  });

  it("simetričan je — poredak lista ne mijenja ishod", () => {
    const a = [local("aa", NOW - 45_000, 45)];
    const b = [avio("aa", NOW - 1_000, 46)];
    expect(mergeLocalFeeds(a, b, NOW)[0].position.lat).toBe(
      mergeLocalFeeds(b, a, NOW)[0].position.lat
    );
  });
});

describe("mergeLocalFeedTickIntoPrevious — brzi tick jednog izvora", () => {
  const NOW = 1_800_000_000_000;
  const local = (id: string, ts: number, lat: number): FlightState => ({
    ...base(id, ts, lat),
    providerId: "localsdr",
  });
  const avio = (id: string, ts: number, lat: number): FlightState => ({
    ...base(id, ts, lat),
    providerId: "avionix",
  });

  it("ne gazi svjež Pi fix", () => {
    const out = mergeLocalFeedTickIntoPrevious(
      [avio("aa", NOW, 46)],
      [local("aa", NOW - 3_000, 45)],
      NOW
    );
    expect(out[0].providerId).toBe("localsdr");
    expect(out[0].position.lat).toBe(45);
  });

  it("preuzima avion koji je Pi izgubio, bez čekanja punog ticka", () => {
    const out = mergeLocalFeedTickIntoPrevious(
      [avio("aa", NOW, 46)],
      [local("aa", NOW - 45_000, 45)],
      NOW
    );
    expect(out[0].providerId).toBe("avionix");
    expect(out[0].position.lat).toBe(46);
  });

  it("isti izvor uvijek ažurira sam sebe", () => {
    const out = mergeLocalFeedTickIntoPrevious(
      [avio("aa", NOW, 46)],
      [avio("aa", NOW - 10_000, 45)],
      NOW
    );
    expect(out[0].position.lat).toBe(46);
  });

  it("zadržava letove kojih nema u ovom ticku (web izvori s prošlog punog ticka)", () => {
    const web: FlightState = { ...base("web1", NOW - 20_000, 44), providerId: "opensky" };
    const out = mergeLocalFeedTickIntoPrevious([avio("aa", NOW, 46)], [web], NOW);
    expect(out.map((f) => f.id).sort()).toEqual(["aa", "web1"]);
  });
});
