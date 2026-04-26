import { getFlightProvider } from "@/lib/flight/flightProviderRegistry";
import type { GeoBounds, MapViewState } from "@/types";
import type { FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";
import { defaultMapViewState } from "@/types/map";
import { create } from "zustand";

/** ±6 h oko sidra vremena. */
export const TIME_SLIDER_WINDOW_MS = 6 * 60 * 60 * 1000;

type MoonTransitState = {
  /**
   * Sidro za klizač: „sada“ pri sinkronizaciji, pomak unutar ±TIME_SLIDER_WINDOW_MS.
   */
  timeAnchorMs: number;
  timeOffsetMs: number;
  referenceEpochMs: number;
  mapView: MapViewState;
  flightProvider: FlightProviderId;
  flights: readonly FlightState[];
  isLoading: boolean;
  error: string | null;
  /** Zrakoplov za odbrojavanje udarca / alata. */
  selectedFlightId: string | null;
  setSelectedFlightId: (id: string | null) => void;
  /**
   * Ručni pomak „sada” za let (OpenSky latencija): pomak je zbraja s wall clock
   * pri ekstrapolaciji pozicije na karti i u alatima.
   */
  openSkyLatencySkewMs: number;
  setOpenSkyLatencySkewMs: (ms: number) => void;
  addOpenSkyLatencySkewMs: (deltaMs: number) => void;
  /** Pomak u ms od timeAnchor; klamper se na ±6 h i ažurira referenceEpochMs. */
  setTimeOffsetMs: (offsetMs: number) => void;
  /**
   * Sidro = sada, pomak = 0. Koristi nakon učitavanja i gumb „Sinkroniziraj“.
   */
  syncTimeToNow: () => void;
  setMapView: (next: Partial<MapViewState>) => void;
  setFlightProvider: (id: FlightProviderId) => void;
  setFlights: (f: readonly FlightState[]) => void;
  loadFlightsInBounds: (bounds: GeoBounds) => Promise<void>;
  resetError: () => void;
};

const MAX_LATENCY_SKEW_MS = 120_000;

function clampOffset(ms: number): number {
  return Math.max(
    -TIME_SLIDER_WINDOW_MS,
    Math.min(TIME_SLIDER_WINDOW_MS, ms)
  );
}

function clampLatencySkew(ms: number): number {
  return Math.max(
    -MAX_LATENCY_SKEW_MS,
    Math.min(MAX_LATENCY_SKEW_MS, ms)
  );
}

export const useMoonTransitStore = create<MoonTransitState>((set, get) => ({
  timeAnchorMs: 0,
  timeOffsetMs: 0,
  referenceEpochMs: 0,
  mapView: defaultMapViewState,
  flightProvider: "static",
  flights: [],
  isLoading: false,
  error: null,
  selectedFlightId: null,
  openSkyLatencySkewMs: 0,
  setOpenSkyLatencySkewMs: (ms) =>
    set({ openSkyLatencySkewMs: clampLatencySkew(ms) }),
  addOpenSkyLatencySkewMs: (deltaMs) =>
    set((s) => ({
      openSkyLatencySkewMs: clampLatencySkew(
        s.openSkyLatencySkewMs + deltaMs
      ),
    })),
  setTimeOffsetMs: (offsetMs) => {
    const o = clampOffset(offsetMs);
    set({
      timeOffsetMs: o,
      referenceEpochMs: get().timeAnchorMs + o,
    });
  },
  syncTimeToNow: () => {
    const now = Date.now();
    set({
      timeAnchorMs: now,
      timeOffsetMs: 0,
      referenceEpochMs: now,
    });
  },
  setMapView: (next) =>
    set((s) => ({ mapView: { ...s.mapView, ...next } })),
  setFlightProvider: (id) => set({ flightProvider: id }),
  setSelectedFlightId: (id) => set({ selectedFlightId: id }),
  setFlights: (f) => set({ flights: f }),
  resetError: () => set({ error: null }),
  loadFlightsInBounds: async (bounds) => {
    set({ isLoading: true, error: null });
    try {
      const p = getFlightProvider(get().flightProvider);
      const flights = await p.getFlightsInBounds({ bounds });
      set({ flights, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error while loading",
        isLoading: false,
      });
    }
  },
}));
