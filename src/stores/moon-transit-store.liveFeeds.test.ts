import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";

const calls: FlightProviderId[] = [];
const lists: Partial<Record<FlightProviderId, readonly FlightState[]>> = {};
const failures: Partial<Record<FlightProviderId, Error>> = {};

vi.mock("@/lib/flight/flightProviderRegistry", () => ({
  getFlightProvider: (id: FlightProviderId) => ({
    id,
    getFlightsInBounds: async () => {
      calls.push(id);
      const fail = failures[id];
      if (fail) throw fail;
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
    for (const k of Object.keys(failures)) delete failures[k as FlightProviderId];
    useMoonTransitStore.setState({
      flightProvider: "opensky",
      liveFlightFeeds: { opensky: true, adsbone: true, localsdr: true, avionix: false },
      providerFlightCounts: { opensky: 0, adsbone: 0, localsdr: 0, avionix: 0 },
      webFeedStatus: { opensky: "idle", adsbone: "idle" },
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

describe("loadFlightsInBounds({ only: 'avionix' }) i localsdr+avionix kombinacija", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(lists)) delete lists[k as FlightProviderId];
    for (const k of Object.keys(failures)) delete failures[k as FlightProviderId];
    useMoonTransitStore.setState({
      flightProvider: "opensky",
      liveFlightFeeds: { opensky: true, adsbone: true, localsdr: true, avionix: true },
      providerFlightCounts: { opensky: 0, adsbone: 0, localsdr: 0, avionix: 0 },
      webFeedStatus: { opensky: "idle", adsbone: "idle" },
      localsdrStatus: "idle",
      avionixStatus: "idle",
      flights: [],
      selectedFlightId: null,
    });
  });

  it("ne poziva web izvore ni localsdr — samo avionix", async () => {
    lists.avionix = [flight("ddd444", 45.6, 15.8)];

    await useMoonTransitStore
      .getState()
      .loadFlightsInBounds(BOUNDS, { only: "avionix" });

    expect(calls).toEqual(["avionix"]);
  });

  it("puni tick spaja localsdr i avionix bez gubitka nijednog", async () => {
    lists.opensky = [];
    lists.adsbone = [];
    lists.localsdr = [flight("aaa111", 45.8, 16.0)];
    lists.avionix = [flight("ddd444", 45.6, 15.8)];

    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    const s = useMoonTransitStore.getState();
    expect(s.flights.map((f) => f.id).sort()).toEqual(["aaa111", "ddd444"]);
    expect(s.providerFlightCounts.localsdr).toBe(1);
    expect(s.providerFlightCounts.avionix).toBe(1);
  });

  it("nedostupan avionix ne briše web ni localsdr letove, avionixStatus ide na unreachable neovisno o localsdrStatus", async () => {
    lists.opensky = [flight("bbb222", 45.9, 16.1)];
    lists.localsdr = [flight("aaa111", 45.8, 16.0)];
    failures.avionix = new Error("Avionix: receiver unreachable");

    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    const s = useMoonTransitStore.getState();
    expect(s.flights.map((f) => f.id).sort()).toEqual(["aaa111", "bbb222"]);
    expect(s.avionixStatus).toBe("unreachable");
    expect(s.localsdrStatus).toBe("ok");
  });

  it("localsdr pobjeđuje avionix za icao24 koje oba vide dok mu je fix svjež (sprječava treperenje — 2026-08-20)", async () => {
    lists.opensky = [];
    lists.adsbone = [];
    lists.localsdr = [{ ...flight("aaa111", 45.8, 16.0), providerId: "localsdr" }];
    // Avionix vidi ISTI avion na blago drukčijoj poziciji (dva neovisna
    // prijemnika gotovo nikad ne javljaju identičnu poziciju).
    lists.avionix = [{ ...flight("aaa111", 45.81, 16.02), providerId: "avionix" }];

    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    const s = useMoonTransitStore.getState();
    const f = s.flights.find((x) => x.id === "aaa111");
    expect(f?.position).toEqual({ lat: 45.8, lng: 16.0 });
    expect(f?.providerId).toBe("localsdr");
  });

  it("avionixov brzi tick ne prepisuje SVJEŽU poziciju koju drži localsdr (sprječava treperenje)", async () => {
    // Puni tick: localsdr postaje autoritativan za aaa111.
    lists.opensky = [];
    lists.adsbone = [];
    lists.localsdr = [{ ...flight("aaa111", 45.8, 16.0), providerId: "localsdr" }];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);
    expect(
      useMoonTransitStore.getState().flights.find((x) => x.id === "aaa111")?.position
    ).toEqual({ lat: 45.8, lng: 16.0 });

    // Avionixov brzi tick (10s): javlja SVJEŽIJU, ali drukčiju poziciju za
    // isti avion. Ne smije prepisati Pi-jevu poziciju.
    lists.avionix = [{ ...flight("aaa111", 45.81, 16.02), providerId: "avionix" }];
    await useMoonTransitStore
      .getState()
      .loadFlightsInBounds(BOUNDS, { only: "avionix" });

    const f = useMoonTransitStore.getState().flights.find((x) => x.id === "aaa111");
    expect(f?.position).toEqual({ lat: 45.8, lng: 16.0 });
    expect(f?.providerId).toBe("localsdr");
  });

  it("avionixov brzi tick i dalje ažurira avione koje localsdr ne vidi", async () => {
    lists.opensky = [];
    lists.adsbone = [];
    lists.avionix = [{ ...flight("ddd444", 45.6, 15.8), providerId: "avionix" }];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    lists.avionix = [{ ...flight("ddd444", 45.65, 15.85), providerId: "avionix" }];
    await useMoonTransitStore
      .getState()
      .loadFlightsInBounds(BOUNDS, { only: "avionix" });

    const f = useMoonTransitStore.getState().flights.find((x) => x.id === "ddd444");
    expect(f?.position).toEqual({ lat: 45.65, lng: 15.85 });
  });

  it("avionix preuzima avion čiji je Pi fix zastario (2026-08-25: 7 % tar1090 redaka je 40 s+ staro)", async () => {
    lists.opensky = [];
    lists.adsbone = [];
    const stalePi: FlightState = {
      ...flight("aaa111", 45.8, 16.0),
      providerId: "localsdr",
      timestamp: Date.now() - 45_000,
    };
    lists.localsdr = [stalePi];
    lists.avionix = [{ ...flight("aaa111", 45.95, 16.2), providerId: "avionix" }];

    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    const f = useMoonTransitStore.getState().flights.find((x) => x.id === "aaa111");
    expect(f?.providerId).toBe("avionix");
    expect(f?.position).toEqual({ lat: 45.95, lng: 16.2 });
  });

  it("brzi avionix tick preuzima avion koji je Pi izgubio — bez čekanja punog ticka", async () => {
    lists.opensky = [];
    lists.adsbone = [];
    lists.localsdr = [
      {
        ...flight("aaa111", 45.8, 16.0),
        providerId: "localsdr",
        timestamp: Date.now() - 45_000,
      },
    ];
    lists.avionix = [];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    lists.avionix = [{ ...flight("aaa111", 45.95, 16.2), providerId: "avionix" }];
    await useMoonTransitStore
      .getState()
      .loadFlightsInBounds(BOUNDS, { only: "avionix" });

    const f = useMoonTransitStore.getState().flights.find((x) => x.id === "aaa111");
    expect(f?.providerId).toBe("avionix");
    expect(f?.position).toEqual({ lat: 45.95, lng: 16.2 });
  });

  it("brzi avionix-tick ne mijenja localsdrStatus (nije pitan taj tick)", async () => {
    lists.localsdr = [flight("aaa111", 45.8, 16.0)];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);
    expect(useMoonTransitStore.getState().localsdrStatus).toBe("ok");

    calls.length = 0;
    failures.avionix = new Error("Avionix: receiver unreachable");
    await useMoonTransitStore
      .getState()
      .loadFlightsInBounds(BOUNDS, { only: "avionix" });

    const s = useMoonTransitStore.getState();
    expect(calls).toEqual(["avionix"]);
    expect(s.avionixStatus).toBe("unreachable");
    expect(s.localsdrStatus).toBe("ok");
  });
});

describe("webFeedStatus", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(lists)) delete lists[k as FlightProviderId];
    for (const k of Object.keys(failures)) delete failures[k as FlightProviderId];
    useMoonTransitStore.setState({
      flightProvider: "opensky",
      liveFlightFeeds: { opensky: true, adsbone: true, localsdr: false, avionix: false },
      providerFlightCounts: { opensky: 0, adsbone: 0, localsdr: 0, avionix: 0 },
      webFeedStatus: { opensky: "idle", adsbone: "idle" },
      flights: [],
      selectedFlightId: null,
    });
  });

  it("429 iz OpenSkya klasificira se kao rate-limited, ne kao pad izvora", async () => {
    failures.opensky = new Error(
      "OpenSky: 429 — rate limit. Using cached data is unavailable; wait ~1 min."
    );
    lists.adsbone = [flight("ccc333", 45.7, 15.9)];

    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    const s = useMoonTransitStore.getState();
    expect(s.webFeedStatus.opensky).toBe("rate-limited");
    expect(s.webFeedStatus.adsbone).toBe("ok");
  });

  it("ostale greške su error", async () => {
    failures.opensky = new Error("OpenSky: 502 upstream error");
    lists.adsbone = [flight("ccc333", 45.7, 15.9)];

    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    expect(useMoonTransitStore.getState().webFeedStatus.opensky).toBe("error");
  });

  it("isključen izvor je idle, ne error", async () => {
    useMoonTransitStore.setState({
      liveFlightFeeds: { opensky: false, adsbone: true, localsdr: false, avionix: false },
    });
    lists.adsbone = [flight("ccc333", 45.7, 15.9)];

    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    const s = useMoonTransitStore.getState();
    expect(s.webFeedStatus.opensky).toBe("idle");
    expect(s.webFeedStatus.adsbone).toBe("ok");
  });

  it("oporavak izvora vraća status na ok", async () => {
    failures.opensky = new Error("OpenSky: 429 rate limit");
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);
    expect(useMoonTransitStore.getState().webFeedStatus.opensky).toBe(
      "rate-limited"
    );

    delete failures.opensky;
    lists.opensky = [flight("bbb222", 45.9, 16.1)];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    expect(useMoonTransitStore.getState().webFeedStatus.opensky).toBe("ok");
  });
});

describe("selekcija praćenog leta", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(lists)) delete lists[k as FlightProviderId];
    for (const k of Object.keys(failures)) delete failures[k as FlightProviderId];
    // Local-only mod: kad oba prijemnika načas vrate prazno, store stvarno
    // ostane bez letova (web retencija ih ovdje ne drži) — to je situacija u
    // kojoj se praćeni let gubio usred odbrojavanja.
    useMoonTransitStore.setState({
      flightProvider: "opensky",
      liveFlightFeeds: { opensky: false, adsbone: false, localsdr: true, avionix: true },
      flights: [],
      selectedFlightId: null,
      selectedFlightMissingSinceMs: null,
    });
  });

  async function selectTrackedFlight() {
    lists.localsdr = [{ ...flight("aaa111", 45.8, 16.0), providerId: "localsdr" }];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);
    useMoonTransitStore.getState().setSelectedFlightId("aaa111");
  }

  it("preživi tick u kojem oba prijemnika vrate prazno", async () => {
    await selectTrackedFlight();

    lists.localsdr = [];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    const s = useMoonTransitStore.getState();
    expect(s.flights).toEqual([]);
    expect(s.selectedFlightId).toBe("aaa111");
    expect(s.selectedFlightMissingSinceMs).not.toBeNull();
  });

  it("otpušta se kad let nedostaje dulje od grace prozora", async () => {
    await selectTrackedFlight();

    lists.localsdr = [];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);
    useMoonTransitStore.setState({
      selectedFlightMissingSinceMs: Date.now() - 25_000,
    });
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    expect(useMoonTransitStore.getState().selectedFlightId).toBeNull();
  });

  it("povratak leta poništi odbrojavanje grace prozora", async () => {
    await selectTrackedFlight();

    lists.localsdr = [];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);
    expect(
      useMoonTransitStore.getState().selectedFlightMissingSinceMs
    ).not.toBeNull();

    lists.localsdr = [{ ...flight("aaa111", 45.85, 16.05), providerId: "localsdr" }];
    await useMoonTransitStore.getState().loadFlightsInBounds(BOUNDS);

    const s = useMoonTransitStore.getState();
    expect(s.selectedFlightId).toBe("aaa111");
    expect(s.selectedFlightMissingSinceMs).toBeNull();
  });
});
