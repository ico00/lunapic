import {
  getTimeSliderWindowMs,
  TIME_SLIDER_6H_HALF_MS,
} from "@/lib/domain/astro/astroService";
import { mergeStickyFlightMetadata } from "@/lib/flight/mergeStickyFlightMetadata";
import { getFlightProvider } from "@/lib/flight/flightProviderRegistry";
import type { GeoBounds, MapViewState } from "@/types";
import type { FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";
import { defaultMapViewState } from "@/types/map";
import { create } from "zustand";

/**
 * Polovina starog klizača (±6 h od središta). Isto kao `TIME_SLIDER_6H_HALF_MS`.
 * @deprecated Prefer `TIME_SLIDER_6H_HALF_MS` from `astroService`.
 */
export const TIME_SLIDER_WINDOW_MS = TIME_SLIDER_6H_HALF_MS;

type MoonTransitState = {
  /**
   * Lijevi rub vremenskog prozora klizača (ms). Nakon synca u fallbacku ≈ `now-6h`;
   * kad su rise/set poznati, odgovara moonrise (početak vidljivog luka).
   */
  timeAnchorMs: number;
  /** Pomak u ms od `timeAnchorMs` (lijevo do desno unutar [t0, t1]). */
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
  /**
   * Suncalc: izlaz / zlaz (UTC kalendaru dan u syncu) i polarna stanja
   * (`alwaysUp` / `alwaysDown` imaju `rise` / `set` = null).
   */
  moonRise: Date | null;
  moonSet: Date | null;
  moonRiseSetKind: "normal" | "alwaysUp" | "alwaysDown";
  setMoonRiseSet: (p: {
    moonRise: Date | null;
    moonSet: Date | null;
    moonRiseSetKind: "normal" | "alwaysUp" | "alwaysDown";
  }) => void;
  /** Pomak u ms od lijevog ruba vremenskog prozora (moonrise→moonset ili ±6h fallback). */
  setTimeOffsetMs: (offsetMs: number) => void;
  /**
   * Broj povećava se u `syncTimeToNow` kako bi `useAstronomySync` ponovno učitao
   * suncalc za UTC dan trenutnog `referenceEpochMs` (ne pri svakom pomicanju klizača).
   */
  ephemerisRefetchKey: number;
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
  ephemerisRefetchKey: 0,
  moonRise: null,
  moonSet: null,
  moonRiseSetKind: "normal",
  setOpenSkyLatencySkewMs: (ms) =>
    set({ openSkyLatencySkewMs: clampLatencySkew(ms) }),
  addOpenSkyLatencySkewMs: (deltaMs) =>
    set((s) => ({
      openSkyLatencySkewMs: clampLatencySkew(
        s.openSkyLatencySkewMs + deltaMs
      ),
    })),
  setTimeOffsetMs: (offsetMs) => {
    const s = get();
    const win = getTimeSliderWindowMs(
      s.referenceEpochMs,
      s.timeAnchorMs,
      {
        rise: s.moonRise,
        set: s.moonSet,
        kind: s.moonRiseSetKind,
      }
    );
    const maxO = win.t1 - win.t0;
    const o = Math.max(0, Math.min(maxO, offsetMs));
    set({
      timeAnchorMs: win.t0,
      timeOffsetMs: o,
      referenceEpochMs: win.t0 + o,
    });
  },
  setMoonRiseSet: (p) =>
    set((s) => {
      const riseSet = {
        rise: p.moonRise,
        set: p.moonSet,
        kind: p.moonRiseSetKind,
      };
      const win = getTimeSliderWindowMs(
        s.referenceEpochMs,
        s.timeAnchorMs,
        riseSet
      );
      const c = Math.min(Math.max(s.referenceEpochMs, win.t0), win.t1);
      return {
        moonRise: p.moonRise,
        moonSet: p.moonSet,
        moonRiseSetKind: p.moonRiseSetKind,
        timeAnchorMs: win.t0,
        timeOffsetMs: c - win.t0,
        referenceEpochMs: c,
      };
    }),
  syncTimeToNow: () => {
    const now = Date.now();
    const s = get();
    const left = now - TIME_SLIDER_6H_HALF_MS;
    const win = getTimeSliderWindowMs(s.referenceEpochMs, left, {
      rise: s.moonRise,
      set: s.moonSet,
      kind: s.moonRiseSetKind,
    });
    const ref = Math.min(Math.max(now, win.t0), win.t1);
    set({
      timeAnchorMs: win.t0,
      timeOffsetMs: ref - win.t0,
      referenceEpochMs: ref,
      ephemerisRefetchKey: s.ephemerisRefetchKey + 1,
    });
  },
  setMapView: (next) =>
    set((s) => ({ mapView: { ...s.mapView, ...next } })),
  setFlightProvider: (id) =>
    set((s) =>
      s.flightProvider === id
        ? {}
        : { flightProvider: id, selectedFlightId: null }
    ),
  setSelectedFlightId: (id) => set({ selectedFlightId: id }),
  setFlights: (f) => set({ flights: f }),
  resetError: () => set({ error: null }),
  loadFlightsInBounds: async (bounds) => {
    set({ isLoading: true, error: null });
    try {
      const p = getFlightProvider(get().flightProvider);
      const previousFlights = get().flights;
      const flights = await p.getFlightsInBounds({ bounds });
      const merged = mergeStickyFlightMetadata(flights, previousFlights);
      const sel = get().selectedFlightId;
      const keepSel =
        sel != null && merged.some((f) => f.id === sel);
      set({
        flights: merged,
        isLoading: false,
        ...(keepSel ? {} : { selectedFlightId: null }),
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error while loading",
        isLoading: false,
      });
    }
  },
}));
