import { describe, expect, it, vi } from "vitest";
import {
  avionixEntryToFlightState,
  flightsFromAvionixResponse,
  type AvionixResponse,
} from "./parseAvionixAircraft";

describe("avionixEntryToFlightState", () => {
  it("mapira polja točnim redoslijedom [callsign, type, reg, squawk, lat, lon, alt_ft, kt, hdg, fpm]", () => {
    const f = avionixEntryToFlightState(
      "3c6589",
      ["DLH123  ", "A319", "D-AIZZ", "1200", 45.8, 16.1, 10000, 250, 90, -500, "Madrid", "Zagreb"],
      1_700_000_000_000
    );
    expect(f).not.toBeNull();
    expect(f?.id).toBe("3c6589");
    expect(f?.icao24).toBe("3c6589");
    expect(f?.callSign).toBe("DLH123");
    expect(f?.airlineIcao).toBe("DLH");
    expect(f?.aircraftType).toBe("A319");
    expect(f?.registration).toBe("D-AIZZ");
    expect(f?.squawk).toBe("1200");
    expect(f?.position).toEqual({ lat: 45.8, lng: 16.1 });
    expect(f?.baroAltitudeMeters).toBeCloseTo(10000 * 0.3048, 5);
    expect(f?.groundSpeedMps).toBeCloseTo(250 * 0.514444, 5);
    expect(f?.trackDeg).toBe(90);
    expect(f?.verticalRateFpm).toBe(-500);
    expect(f?.providerId).toBeUndefined(); // postavlja se tek u flightsFromAvionixResponse
  });

  it("popunjava wingspanMeters/lengthMeters odmah iz poznatog typecodea", () => {
    const f = avionixEntryToFlightState(
      "3c6589",
      ["", "A319", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
      1_700_000_000_000
    );
    expect(f?.wingspanMeters).not.toBeNull();
    expect(f?.lengthMeters).not.toBeNull();
  });

  it("vraća null bez lat/lon", () => {
    const f = avionixEntryToFlightState(
      "3c6589",
      ["", "", "", "", null, null, 10000, 250, 90, 0, "", ""],
      1_700_000_000_000
    );
    expect(f).toBeNull();
  });

  it("filtrira po bounds", () => {
    const f = avionixEntryToFlightState(
      "3c6589",
      ["", "", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
      1_700_000_000_000,
      { north: 40, south: 30, east: 10, west: 0 }
    );
    expect(f).toBeNull();
  });

  it("prazan icao24 hex vraća null", () => {
    const f = avionixEntryToFlightState(
      "",
      ["", "", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
      1_700_000_000_000
    );
    expect(f).toBeNull();
  });
});

describe("flightsFromAvionixResponse", () => {
  it("preskače timestamp/update_age kao meta-ključeve (nisu nizovi)", () => {
    const data: AvionixResponse = {
      timestamp: "2026-08-20T12:00:00.000Z",
      update_age: 349,
      "3c6589": ["DLH123", "A319", "D-AIZZ", "1200", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
    };
    const out = flightsFromAvionixResponse(data);
    expect(out).toHaveLength(1);
    expect(out[0].providerId).toBe("avionix");
    expect(out[0].id).toBe("3c6589");
  });

  it("koristi payload timestamp kao nowMs za sve avione u snapshotu", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
    try {
      const data: AvionixResponse = {
        timestamp: "2026-08-20T12:00:00.000Z",
        "3c6589": ["", "", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
      };
      const out = flightsFromAvionixResponse(data);
      expect(out[0].timestamp).toBe(Date.parse("2026-08-20T12:00:00.000Z"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("epoch ms kao string (stvarni oblik s uređaja) NIJE ISO — mora se parsirati", () => {
    // Uređaj šalje `"timestamp":"1787679514274"`. `Date.parse` na tome vraća
    // NaN, pa je do 2026-08-25 svaki fix dobivao `Date.now()` i gubila se
    // kompenzacija starosti (push 10 s + poll 10 s + cache 3 s).
    const deviceMs = Date.now() - 8_000;
    const data: AvionixResponse = {
      timestamp: String(deviceMs),
      "3c6589": ["", "", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
    };
    expect(flightsFromAvionixResponse(data)[0].timestamp).toBe(deviceMs);
  });

  it("prihvaća i sekunde", () => {
    const sec = Math.floor((Date.now() - 5_000) / 1000);
    const data: AvionixResponse = {
      timestamp: String(sec),
      "3c6589": ["", "", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
    };
    expect(flightsFromAvionixResponse(data)[0].timestamp).toBe(sec * 1000);
  });

  it("odbacuje odlutali sat uređaja i pada na Date.now()", () => {
    // NanoPi nema RTC i root mu se resetira na reboot — krivi timestamp bi
    // gurao markere u budućnost umjesto da ih samo ne pomiče.
    const before = Date.now();
    const data: AvionixResponse = {
      timestamp: String(Date.now() + 60 * 60_000),
      "3c6589": ["", "", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
    };
    expect(flightsFromAvionixResponse(data)[0].timestamp).toBeGreaterThanOrEqual(
      before
    );
  });

  it("prazan/nepoznat timestamp pada natrag na Date.now()", () => {
    const before = Date.now();
    const data: AvionixResponse = {
      "3c6589": ["", "", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
    };
    const out = flightsFromAvionixResponse(data);
    expect(out[0].timestamp).toBeGreaterThanOrEqual(before);
  });

  it("prazan odgovor daje prazan popis", () => {
    expect(flightsFromAvionixResponse({ timestamp: "x", update_age: 0 })).toEqual([]);
  });
});
