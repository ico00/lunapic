import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";

const calls: FlightProviderId[] = [];
const lists: Partial<Record<FlightProviderId, readonly FlightState[]>> = {};

vi.mock("@/lib/flight/flightProviderRegistry", () => ({
  getFlightProvider: (id: FlightProviderId) => ({
    id,
    getFlightsInBounds: async () => {
      calls.push(id);
      return lists[id] ?? [];
    },
    getRouteLineFeatures: () => [],
    getRouteCorridorStats: () => null,
  }),
}));

const { useMoonTransitStore } = await import("./moon-transit-store");

const BOUNDS = { north: 46.7, south: 44.9, east: 17.4, west: 14.8 };

function flight(id: string, lat: number, lng: number): FlightState {
  return {
    id,
    icao24: id,
    callSign: id.toUpperCase(),
    position: { lat, lng },
    baroAltitudeMeters: 10_000,
    geoAltitudeMeters: 10_200,
    groundSpeedMps: 230,
    trackDeg: 90,
    timestamp: Date.now(),
  };
}

describe("loadFlightsInBounds({ only: 'localsdr' })", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(lists)) delete lists[k as FlightProviderId];
    useMoonTransitStore.setState({
      flightProvider: "opensky",
      liveFlightFeeds: { opensky: true, adsbone: true, localsdr: true },
      providerFlightCounts: { opensky: 0, adsbone: 0, localsdr: 0 },
      flights: [],
      selectedFlightId: null,
    });
  });

  it("ne poziva web izvore — samo localsdr", async () => {
    lists.localsdr = [flight("aaa111", 45.8, 16.0)];

    await useMoonTransitStore
      .getState()
      .loadFlightsInBounds(BOUNDS, { only: "localsdr" });

    expect(calls).toEqual(["localsdr"]);
  });

  it("zadržava zadnje web letove i njihove brojače", async () => {
    lists.opensky = [flight("bbb222", 45.9, 16.1)];
    lists.adsbone = [flight("ccc333", 45.7, 15.9)];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);
    const afterFull = useMoonTransitStore.getState();
    expect(afterFull.flights.map((f) => f.id).sort()).toEqual([
      "bbb222",
      "ccc333",
    ]);

    calls.length = 0;
    lists.localsdr = [flight("aaa111", 45.8, 16.0)];
    await useMoonTransitStore
      .getState()
      .loadFlightsInBounds(BOUNDS, { only: "localsdr" });

    const s = useMoonTransitStore.getState();
    expect(calls).toEqual(["localsdr"]);
    expect(s.flights.map((f) => f.id).sort()).toEqual([
      "aaa111",
      "bbb222",
      "ccc333",
    ]);
    expect(s.providerFlightCounts.opensky).toBe(1);
    expect(s.providerFlightCounts.adsbone).toBe(1);
    expect(s.providerFlightCounts.localsdr).toBe(1);
  });

  it("prazan Pi ne briše web letove s karte", async () => {
    lists.opensky = [flight("bbb222", 45.9, 16.1)];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    lists.localsdr = [];
    await useMoonTransitStore
      .getState()
      .loadFlightsInBounds(BOUNDS, { only: "localsdr" });

    const s = useMoonTransitStore.getState();
    expect(s.flights.map((f) => f.id)).toEqual(["bbb222"]);
    expect(s.providerFlightCounts.localsdr).toBe(0);
    expect(s.providerFlightCounts.opensky).toBe(1);
  });

  it("bez opts i dalje zove sve uključene izvore", async () => {
    lists.opensky = [flight("bbb222", 45.9, 16.1)];
    lists.localsdr = [flight("aaa111", 45.8, 16.0)];

    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    expect(calls.sort()).toEqual(["adsbone", "localsdr", "opensky"]);
  });
});
