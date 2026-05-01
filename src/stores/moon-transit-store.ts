import {
  getTimeSliderWindowMs,
  UTC_DAY_MS,
} from "@/lib/domain/astro/astroService";
import type { CameraSensorType } from "@/lib/domain/geometry/shotFeasibility";
import {
  clearOpenSkyFlightRetention,
  mergeFlightsWithOpenSkyRetention,
} from "@/lib/flight/mergeFlightsWithOpenSkyRetention";
import { getFlightProvider } from "@/lib/flight/flightProviderRegistry";
import { useObserverStore } from "@/stores/observer-store";
import type { GeoBounds, MapViewState } from "@/types";
import type { FlightState } from "@/types/flight";
import type { FlightProviderId } from "@/types/flight-provider";
import { defaultMapViewState } from "@/types/map";
import { create } from "zustand";

/** Širina klizača u ms (civilni dan naprijed od sidra). */
export const TIME_SLIDER_WINDOW_MS = UTC_DAY_MS;

type MoonTransitState = {
  /**
   * Sidro klizača (ms): **Sync** postavlja na `Date.now()`; lijevi rub trake = ovaj trenutak.
   * Ne pomiče se pri pomicanju klizača (desno do +~24 h).
   */
  timeAnchorMs: number;
  /** Pomak u ms od `timeAnchorMs` (0 … `UTC_DAY_MS`). */
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
  cameraFocalLengthMm: number;
  cameraSensorType: CameraSensorType;
  setCameraFocalLengthMm: (mm: number) => void;
  setCameraSensorType: (sensor: CameraSensorType) => void;
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
  /** Pomak u ms naprijed od sidra (maks. civilni dan). */
  setTimeOffsetMs: (offsetMs: number) => void;
  /**
   * Broj povećava u `syncTimeToNow` i kad klizač prijeđe u drugi UTC kalendar dan
   * (`setTimeOffsetMs`), da `useAstronomySync` ponovno učita suncalc za taj dan.
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

function utcCalendarDayStartMs(t: number): number {
  const d = new Date(t);
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate()
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
  flightProvider: "opensky",
  flights: [],
  isLoading: false,
  error: null,
  selectedFlightId: null,
  openSkyLatencySkewMs: 0,
  cameraFocalLengthMm: 600,
  cameraSensorType: "fullFrame",
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
  setCameraFocalLengthMm: (mm) =>
    set({
      cameraFocalLengthMm: Math.max(50, Math.min(2400, Math.round(mm))),
    }),
  setCameraSensorType: (sensor) => set({ cameraSensorType: sensor }),
  setTimeOffsetMs: (offsetMs) => {
    const s = get();
    const riseSet = {
      rise: s.moonRise,
      set: s.moonSet,
      kind: s.moonRiseSetKind,
    };
    const win = getTimeSliderWindowMs(s.referenceEpochMs, s.timeAnchorMs, riseSet);
    const anchor = s.timeAnchorMs > 0 ? s.timeAnchorMs : win.t0;
    const maxO = UTC_DAY_MS;
    const o = Math.max(0, Math.min(maxO, offsetMs));
    const ref = anchor + o;
    const prevRef = s.referenceEpochMs;
    const shouldRefetchEphemeris =
      prevRef > 0 && utcCalendarDayStartMs(ref) !== utcCalendarDayStartMs(prevRef);
    set({
      timeAnchorMs: s.timeAnchorMs,
      timeOffsetMs: ref - anchor,
      referenceEpochMs: ref,
      ephemerisRefetchKey: shouldRefetchEphemeris
        ? s.ephemerisRefetchKey + 1
        : s.ephemerisRefetchKey,
    });
  },
  setMoonRiseSet: (p) =>
    set((s) => {
      const anchor = s.timeAnchorMs;
      if (anchor <= 0) {
        return {
          moonRise: p.moonRise,
          moonSet: p.moonSet,
          moonRiseSetKind: p.moonRiseSetKind,
        };
      }
      const t1 = anchor + UTC_DAY_MS;
      const c = Math.min(Math.max(s.referenceEpochMs, anchor), t1);
      return {
        moonRise: p.moonRise,
        moonSet: p.moonSet,
        moonRiseSetKind: p.moonRiseSetKind,
        timeOffsetMs: c - anchor,
        referenceEpochMs: c,
      };
    }),
  syncTimeToNow: () => {
    const now = Date.now();
    const s = get();
    set({
      timeAnchorMs: now,
      timeOffsetMs: 0,
      referenceEpochMs: now,
      ephemerisRefetchKey: s.ephemerisRefetchKey + 1,
    });
  },
  setMapView: (next) =>
    set((s) => ({ mapView: { ...s.mapView, ...next } })),
  setFlightProvider: (id) =>
    set((s) => {
      if (s.flightProvider === id) {
        return {};
      }
      clearOpenSkyFlightRetention();
      return { flightProvider: id, selectedFlightId: null };
    }),
  setSelectedFlightId: (id) => set({ selectedFlightId: id }),
  setFlights: (f) => set({ flights: f }),
  resetError: () => set({ error: null }),
  loadFlightsInBounds: async (bounds) => {
    set({ isLoading: true, error: null });
    try {
      const p = getFlightProvider(get().flightProvider);
      const previousFlights = get().flights;
      const observer = useObserverStore.getState().observer;
      const flights = await p.getFlightsInBounds({ bounds, observer });
      const merged = mergeFlightsWithOpenSkyRetention(flights, previousFlights, {
        providerId: get().flightProvider,
        mapBounds: bounds,
        nowMs: Date.now(),
        openSkyLatencySkewMs: get().openSkyLatencySkewMs,
      });
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
