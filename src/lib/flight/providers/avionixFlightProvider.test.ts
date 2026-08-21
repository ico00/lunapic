import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvionixFlightProvider } from "./avionixFlightProvider";

const BOUNDS = { north: 90, south: -90, east: 180, west: -180 };

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("AvionixFlightProvider — stabilizeTimestamps", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ne pomiče timestamp kad uređaj ponovi istu lat/lng preko dva polla (2026-08-21 regresija)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          timestamp: "2026-08-21T12:00:00.000Z",
          "3c6589": ["DLH123", "A319", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
        })
      )
      .mockResolvedValueOnce(
        // Isti device row 10s kasnije — uređajeva interna tablica nije se
        // stvarno osvježila, ali response-level timestamp jest.
        jsonResponse({
          timestamp: "2026-08-21T12:00:10.000Z",
          "3c6589": ["DLH123", "A319", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
        })
      );

    const provider = new AvionixFlightProvider();
    const first = await provider.getFlightsInBounds({ bounds: BOUNDS });
    expect(first[0]?.timestamp).toBe(Date.parse("2026-08-21T12:00:00.000Z"));

    // Prođi kroz interni 3s dedup-cache prozor da drugi poziv stvarno zove fetch.
    await vi.advanceTimersByTimeAsync(10_000);
    const second = await provider.getFlightsInBounds({ bounds: BOUNDS });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second[0]?.timestamp).toBe(Date.parse("2026-08-21T12:00:00.000Z"));
  });

  it("pomiče timestamp kad se lat/lng stvarno promijeni", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          timestamp: "2026-08-21T12:00:00.000Z",
          "3c6589": ["DLH123", "A319", "", "", 45.8, 16.1, 10000, 250, 90, 0, "", ""],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          timestamp: "2026-08-21T12:00:10.000Z",
          "3c6589": ["DLH123", "A319", "", "", 45.81, 16.12, 10000, 250, 90, 0, "", ""],
        })
      );

    const provider = new AvionixFlightProvider();
    await provider.getFlightsInBounds({ bounds: BOUNDS });
    await vi.advanceTimersByTimeAsync(10_000);
    const second = await provider.getFlightsInBounds({ bounds: BOUNDS });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second[0]?.timestamp).toBe(Date.parse("2026-08-21T12:00:10.000Z"));
    expect(second[0]?.position).toEqual({ lat: 45.81, lng: 16.12 });
  });
});
