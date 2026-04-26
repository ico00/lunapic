import type { IFlightProvider } from "@/types";
import type { FlightQuery, FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";
import { randomId } from "./randomId";

/**
 * Returns predictable demo traffic inside the requested bounds.
 * Dependency-free stand-in for API-backed providers (OpenSky, etc.).
 */
export class MockFlightProvider implements IFlightProvider {
  readonly id: FlightProviderId = "mock";

  async getFlightsInBounds(q: FlightQuery): Promise<readonly FlightState[]> {
    const { south, west, north, east } = q.bounds;
    const h = 10_000;
    const t = Date.now();
    const midLat = (south + north) / 2;
    const midLng = (west + east) / 2;
    const dLat = (north - south) * 0.1;
    const dLng = (east - west) * 0.1;

    const flights: FlightState[] = [
      {
        id: randomId("M1"),
        callSign: "DEMO-1",
        position: { lat: midLat + dLat, lng: midLng - dLng },
        baroAltitudeMeters: h,
        geoAltitudeMeters: h,
        groundSpeedMps: 200,
        trackDeg: 35,
        timestamp: t,
      },
      {
        id: randomId("M2"),
        callSign: "DEMO-2",
        position: { lat: midLat, lng: midLng + dLng * 0.3 },
        baroAltitudeMeters: 8_200,
        geoAltitudeMeters: 8_200,
        groundSpeedMps: 180,
        trackDeg: 200,
        timestamp: t,
      },
    ];
    return flights;
  }
}
