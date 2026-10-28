import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flightsFromAvionixResponse } from "@/lib/flight/avionix/parseAvionixAircraft";
import { flightsFromLocalSdrResponse } from "@/lib/flight/localsdr/parseLocalSdrAircraft";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import { mergeLocalFeeds } from "@/lib/flight/mergeLiveFlightLists";

/**
 * Stvarni par snimaka snimljen istovremeno s oba prijemnika (2026-08-25,
 * WZZ359 / icao24 4d2455). Pi ga je zadnji put stvarno vidio prije 49.9 s i
 * dalje ga navodi u `aircraft.json`; Avionix za isti avion ima svjež fix ~18 km
 * dalje niz putanju.
 *
 * Ovo je oblik kvara zbog kojeg je popravak i nastao: dok je fiksni prioritet
 * bio bezuvjetan, karta je crtala Pi-jev fix zamrznut na `MAX_LEAD_SEC` (40 s)
 * ekstrapolacije, a odbrojavanje je računalo prema poziciji koja je bila
 * kilometrima iza stvarne.
 */
const SDR_SNAPSHOT = {
  now: 1787679723,
  aircraft: [
    {
      hex: "4d2455",
      flight: "WZZ359  ",
      alt_baro: 37975,
      alt_geom: 39375,
      gs: 429.1,
      track: 215.8,
      lat: 46.959183,
      lon: 15.638145,
      seen_pos: 49.907,
      seen: 29.5,
      category: "A3",
      squawk: "1000",
    },
  ],
} as const;

const AVIONIX_SNAPSHOT = {
  timestamp: "1787679723285",
  "4d2455": ["WZZ359  ", "", "", "1000", 47.092011, 15.777917, 36025, 429, 216, 0, "Timisoara", "Dortmund"],
} as const;

const NOW_MS = 1787679723410;

describe("stvarni feed: zastarjeli Pi redak vs svjež Avionix fix", () => {
  // Uređajev timestamp se prihvaća samo blizu našeg sata, pa fixture mora
  // teći u vremenu u kojem je i snimljen.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Avionix preuzima avion koji Pi drži u odgovoru, ali ga zapravo više ne vidi", () => {
    const sdr = flightsFromLocalSdrResponse(SDR_SNAPSHOT);
    const avionix = flightsFromAvionixResponse(
      AVIONIX_SNAPSHOT as unknown as Parameters<typeof flightsFromAvionixResponse>[0]
    );
    expect(NOW_MS - sdr[0].timestamp).toBeGreaterThan(40_000);

    const merged = mergeLocalFeeds(sdr, avionix, NOW_MS);
    expect(merged).toHaveLength(1);
    expect(merged[0].providerId).toBe("avionix");
    expect(merged[0].position.lat).toBeCloseTo(47.092011, 5);
  });

  it("razlika koju je stari merge crtao je bila kilometarska", () => {
    const sdr = flightsFromLocalSdrResponse(SDR_SNAPSHOT);
    const avionix = flightsFromAvionixResponse(
      AVIONIX_SNAPSHOT as unknown as Parameters<typeof flightsFromAvionixResponse>[0]
    );
    // Pi fix + ekstrapolacija (zapinje na MAX_LEAD_SEC = 40 s) vs svjež fix.
    const shownFromSdr = extrapolateFlightForDisplay(sdr[0], NOW_MS, 0);
    const gapM = greatCircleDistanceMeters(
      shownFromSdr.position.lat,
      shownFromSdr.position.lng,
      avionix[0].position.lat,
      avionix[0].position.lng
    );
    expect(gapM).toBeGreaterThan(5_000);
  });

  it("dok je Pi-jev fix svjež, on i dalje vodi (nema treperenja između prijemnika)", () => {
    const freshSdr = flightsFromLocalSdrResponse({
      ...SDR_SNAPSHOT,
      aircraft: [{ ...SDR_SNAPSHOT.aircraft[0], seen_pos: 1.2 }],
    });
    const avionix = flightsFromAvionixResponse(
      AVIONIX_SNAPSHOT as unknown as Parameters<typeof flightsFromAvionixResponse>[0]
    );
    const merged = mergeLocalFeeds(freshSdr, avionix, NOW_MS);
    expect(merged[0].providerId).toBe("localsdr");
  });
});
