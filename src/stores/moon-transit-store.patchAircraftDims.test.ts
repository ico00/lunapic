import { beforeEach, describe, expect, it } from "vitest";
import { useMoonTransitStore } from "./moon-transit-store";
import type { FlightState } from "@/types/flight";

function flight(partial: Partial<FlightState>): FlightState {
  return {
    id: "abc123",
    position: { lat: 45.8, lng: 16.0 },
    baroAltitudeMeters: 11000,
    geoAltitudeMeters: 11200,
    groundSpeedMps: 230,
    trackDeg: 270,
    timestamp: Date.now(),
    ...partial,
  };
}

describe("patchFlightAircraftTypeFromIndex — dimenzije", () => {
  beforeEach(() => {
    useMoonTransitStore.setState({ flights: [flight({})] });
  });

  it("puni aircraftType + wingspan + length kad su prazni", () => {
    useMoonTransitStore
      .getState()
      .patchFlightAircraftTypeFromIndex("abc123", "Airbus A320", {
        wingspanMeters: 35.8,
        lengthMeters: 37.6,
      });
    const f = useMoonTransitStore.getState().flights[0];
    expect(f.aircraftType).toBe("Airbus A320");
    expect(f.wingspanMeters).toBe(35.8);
    expect(f.lengthMeters).toBe(37.6);
  });

  it("ne gazi postojeći aircraftType iz providera, ali dopuni dimenzije", () => {
    useMoonTransitStore.setState({
      flights: [flight({ aircraftType: "B738 (provider)" })],
    });
    useMoonTransitStore
      .getState()
      .patchFlightAircraftTypeFromIndex("abc123", "Boeing 737-800", {
        wingspanMeters: 35.8,
        lengthMeters: 39.5,
      });
    const f = useMoonTransitStore.getState().flights[0];
    expect(f.aircraftType).toBe("B738 (provider)");
    expect(f.wingspanMeters).toBe(35.8);
  });

  it("bez ikakvih novosti vraća isti objekt (nema identity churna)", () => {
    useMoonTransitStore.setState({
      flights: [
        flight({ aircraftType: "X", wingspanMeters: 30, lengthMeters: 31 }),
      ],
    });
    const before = useMoonTransitStore.getState().flights[0];
    useMoonTransitStore
      .getState()
      .patchFlightAircraftTypeFromIndex("abc123", "Y", {
        wingspanMeters: 99,
        lengthMeters: 99,
      });
    expect(useMoonTransitStore.getState().flights[0]).toBe(before);
  });

  it("patch samo s dimenzijama (bez labela) prolazi", () => {
    useMoonTransitStore
      .getState()
      .patchFlightAircraftTypeFromIndex("abc123", "", {
        wingspanMeters: 28.7,
        lengthMeters: 38.7,
      });
    const f = useMoonTransitStore.getState().flights[0];
    expect(f.wingspanMeters).toBe(28.7);
    expect(f.lengthMeters).toBe(38.7);
  });
});
