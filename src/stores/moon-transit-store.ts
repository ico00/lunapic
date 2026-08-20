import {
  getTimeSliderWindowMs,
  UTC_DAY_MS,
} from "@/lib/domain/astro/astroService";
import {
  DEFAULT_CAMERA_PRESET_ID,
  getCameraPresetById,
} from "@/lib/camera/cameraPresets";
import type { CameraSensorType } from "@/lib/domain/geometry/shotFeasibility";
import {
  mergeLiveFlightLists,
  mergeLiveFlightListsWithSdrPriority,
} from "@/lib/flight/mergeLiveFlightLists";
import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import {
  clearOpenSkyFlightRetention,
  mergeFlightsWithOpenSkyRetention,
} from "@/lib/flight/mergeFlightsWithOpenSkyRetention";
import type { AircraftDimensions } from "@/lib/flight/aircraftTypeDimensions";
import { AdsbLiveProxyError } from "@/lib/flight/adsbone/fetchAdsbOneUpstream";
import { getFlightProvider } from "@/lib/flight/flightProviderRegistry";

/** Stanje jednog web izvora letova (OpenSky / adsb.lol) nakon zadnjeg ticka. */
export type WebFeedStatus = "idle" | "ok" | "rate-limited" | "error";

/**
 * Kvota je najčešći kvar web izvora, a poruke stižu iz dva sloja: tipizirane
 * `AdsbLiveProxyError` (nosi status) i običnog `Error` iz OpenSky providera.
 */
function webFeedStatusFromError(reason: unknown): WebFeedStatus {
  if (reason instanceof AdsbLiveProxyError) {
    return reason.status === 429 || reason.upstreamStatus === 429
      ? "rate-limited"
      : "error";
  }
  const msg = reason instanceof Error ? reason.message : String(reason);
  return /\b429\b|rate limit/i.test(msg) ? "rate-limited" : "error";
}
import type { FlightAltitudeLegendUnit } from "@/lib/map/flightAltitudeColor";
import { useObserverStore } from "@/stores/observer-store";
import type { GeoBounds, MapViewState } from "@/types";
import type { FlightState } from "@/types/flight";
import type { MapDisplayMode } from "@/types/map-display";
import type { FlightProviderId } from "@/types/flight-provider";

/** Koji live REST izvori su uključeni (ICAO24 se spaja u jedan zapis po zrakoplovu). */
export type LiveFlightFeeds = {
  readonly opensky: boolean;
  readonly adsbone: boolean;
  /** Lokalni SDR prijemnik (dump1090/readsb). Zahtijeva LOCAL_SDR_URL u .env.local. */
  readonly localsdr: boolean;
  /** Avionix Nano ADS-B. Zahtijeva AVIONIX_URL u .env.local (dev) ili push u produkciji. */
  readonly avionix: boolean;
};
import { defaultMapViewState } from "@/types/map";
import { create } from "zustand";

/** Next-pass prediction for a flight-log callsign (mirror of the API's NextPassPrediction). */
export type FlightLogNextPass = {
  readonly callsign: string;
  readonly estimateMs: number;
  readonly stdMinutes: number;
  readonly sessionCount: number;
};

/** Altitude profile of the selected callsign over the observer area, metres. */
export type FlightLogAltitude = {
  readonly callsign: string;
  readonly minM: number;
  readonly medianM: number;
  readonly maxM: number;
};

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
  /**
   * Planning mode: sidro je ručno postavljeno na budući datum (date picker),
   * pa `tickLiveTime` NE smije povlačiti sidro na `Date.now()`. Live-ovisni
   * izračuni (kandidati, active transits, photographer countdown) se gase.
   * `syncTimeToNow` vraća na `false`.
   */
  timeAnchorIsPlanned: boolean;
  /** Postavi sidro na zadani trenutak (lokalna ponoć odabranog dana) i uđi u planning mode. */
  setTimeAnchorPlanned: (anchorMs: number) => void;
  mapView: MapViewState;
  flightProvider: FlightProviderId;
  /** Vrijedi kad je `flightProvider` `opensky` ili `adsbone`; inače se ignorira pri učitavanju. */
  liveFlightFeeds: LiveFlightFeeds;
  flights: readonly FlightState[];
  providerFlightCounts: { opensky: number; adsbone: number; localsdr: number; avionix: number };
  /**
   * Reachability of the local SDR upstream (Pi via `/api/localsdr/aircraft`).
   * `idle` = feed off; `ok` = last fetch succeeded; `unreachable` = last fetch
   * failed (Pi/Funnel down). Lets the UI warn instead of showing a silent empty list.
   */
  localsdrStatus: "idle" | "ok" | "unreachable";
  /** Isto kao `localsdrStatus`, za Avionix Nano prijemnik (`/api/avionix/aircraft`). */
  avionixStatus: "idle" | "ok" | "unreachable";
  /**
   * Stanje web izvora nakon zadnjeg punog ticka. `rate-limited` je odvojeno od
   * `error` jer je to najčešći kvar (OpenSky troši kredite po zahtjevu) i traži
   * drukčiju poruku korisniku: pričekaj, ne "izvor je pao".
   */
  webFeedStatus: { opensky: WebFeedStatus; adsbone: WebFeedStatus };
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
  cameraPresetId: string;
  /** Matches the active preset dimensions (or manual values when preset is Other). */
  cameraFrameWidthPx: number;
  cameraFrameHeightPx: number;
  setCameraFocalLengthMm: (mm: number) => void;
  setCameraSensorType: (sensor: CameraSensorType) => void;
  setCameraPresetId: (presetId: string) => void;
  setCameraFrameWidthPx: (widthPx: number) => void;
  setCameraFrameHeightPx: (heightPx: number) => void;
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
   * Sidro = sada, pomak = 0. Koristi nakon učitavanja i gumb „Sinkroniziraj”.
   */
  syncTimeToNow: () => void;
  /**
   * Napreduje `timeAnchorMs` i `referenceEpochMs` na `Date.now()` samo
   * kada je `timeOffsetMs === 0` (live mode). Ne dira `ephemerisRefetchKey`
   * osim ako prijeđemo UTC kalendarski dan.
   */
  tickLiveTime: () => void;
  setMapView: (next: Partial<MapViewState>) => void;
  /** Kad je uključeno, markeri letova koriste skalu boja po visini (legend); inače neutralna siva osim zelenog za shot-feasible. */
  mapAircraftAltitudeColors: boolean;
  setMapAircraftAltitudeColors: (enabled: boolean) => void;
  /** Samo prikaz oznaka ispod altitude legende (km MSL vs tisuće ft MSL). */
  flightAltitudeLegendUnit: FlightAltitudeLegendUnit;
  setFlightAltitudeLegendUnit: (unit: FlightAltitudeLegendUnit) => void;
  /** 0 = svi letovi (All), 1–6 = indeks u ALTITUDE_BANDS (filtrira po visini). */
  altitudeBandIndex: number;
  setAltitudeBandIndex: (i: number) => void;
  /** Način crtanja karte/aviona: puni 3D ili pojednostavljeni ATC-like prikaz. */
  mapDisplayMode: MapDisplayMode;
  setMapDisplayMode: (mode: MapDisplayMode) => void;
  /** Flight history overlay: show heatmap and/or route lines from local ADS-B log. */
  flightHistoryHeatmap: boolean;
  setFlightHistoryHeatmap: (v: boolean) => void;
  /** Hour-of-day window (viewer-local, inclusive; from > to wraps midnight). null = all hours. */
  flightHistoryHourFilter: { from: number; to: number } | null;
  setFlightHistoryHourFilter: (f: { from: number; to: number } | null) => void;
  flightHistoryRoutes: boolean;
  setFlightHistoryRoutes: (v: boolean) => void;
  /** LDZA (Zagreb Airport) runway 04/22 reference line overlay — off by default. */
  airportRunwayOverlay: boolean;
  setAirportRunwayOverlay: (v: boolean) => void;
  /** ICAO24 selected from the Flight log panel — triggers trail render on the main map. */
  flightLogSelectedIcao24: string | null;
  flightLogDaysBack: number;
  setFlightLogSelected: (icao24: string | null, days?: number) => void;
  /** Keeps the map layers' lookback window in sync with the panel's range pills. */
  setFlightLogDaysBack: (days: number) => void;
  /** Callsign selected from the Flight log panel — triggers session history + mean path on map. */
  flightLogSelectedCallsign: string | null;
  setFlightLogSelectedCallsign: (callsign: string | null, days?: number) => void;
  /** Next-pass prediction for the selected callsign (from callsign-analysis API). */
  flightLogNextPass: FlightLogNextPass | null;
  setFlightLogNextPass: (p: FlightLogNextPass | null) => void;
  /** Altitude profile for the selected callsign (from callsign-analysis API). */
  flightLogAltitude: FlightLogAltitude | null;
  setFlightLogAltitude: (a: FlightLogAltitude | null) => void;
  setFlightProvider: (id: FlightProviderId) => void;
  setLiveFlightFeeds: (patch: Partial<LiveFlightFeeds>) => void;
  /** Ako je još `static` (stari build), prebaci na live dual — static nije u comboboxu. */
  ensureFlightSourceComboboxMode: () => void;
  setFlights: (f: readonly FlightState[]) => void;
  pruneFlightsToObserverRadius: (observerLat: number, observerLng: number, radiusKm: number) => void;
  /**
   * Upisuje `aircraftType` iz lokalnog OpenSky ICAO24 indeksa kad live izvor ne šalje tip.
   * Ne prepisuje postojeći neprazan tip (npr. statične rute).
   */
  patchFlightAircraftTypeFromIndex: (
    flightId: string,
    aircraftType: string,
    dimensions?: AircraftDimensions | null
  ) => void;
  /**
   * `opts.only === "localsdr"` osvježava **samo** lokalni SDR i zadržava
   * zadnje poznate web letove (OpenSky/adsb.lol) preko retention mehanizma.
   * Koristi ga brzi 10 s tick, da lokalni prijemnik može ići gušće a da svaki
   * njegov tick ne troši OpenSky kredite.
   */
  loadFlightsInBounds: (
    bounds: GeoBounds,
    opts?: { readonly only?: "localsdr" | "avionix" }
  ) => Promise<void>;
  resetError: () => void;
};

const MAX_LATENCY_SKEW_MS = 120_000;
const MIN_CAMERA_FRAME_PX = 128;
const MAX_CAMERA_FRAME_PX = 16384;

function clampCameraFramePx(n: number): number {
  return Math.max(
    MIN_CAMERA_FRAME_PX,
    Math.min(MAX_CAMERA_FRAME_PX, Math.round(n))
  );
}

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
  timeAnchorIsPlanned: false,
  mapView: defaultMapViewState,
  flightProvider: "opensky",
  liveFlightFeeds: { opensky: true, adsbone: true, localsdr: true, avionix: true },
  flights: [],
  providerFlightCounts: { opensky: 0, adsbone: 0, localsdr: 0, avionix: 0 },
  localsdrStatus: "idle",
  avionixStatus: "idle",
  webFeedStatus: { opensky: "idle", adsbone: "idle" },
  isLoading: false,
  error: null,
  selectedFlightId: null,
  openSkyLatencySkewMs: 0,
  cameraFocalLengthMm: 600,
  cameraSensorType: "fullFrame",
  cameraPresetId: DEFAULT_CAMERA_PRESET_ID,
  cameraFrameWidthPx: 6000,
  cameraFrameHeightPx: 4000,
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
  setCameraPresetId: (presetId) => {
    const preset = getCameraPresetById(presetId);
    if (preset.kind === "manual") {
      set({ cameraPresetId: preset.id });
      return;
    }
    set({
      cameraPresetId: preset.id,
      cameraSensorType: preset.sensorType,
      cameraFrameWidthPx: preset.frameWidthPx,
      cameraFrameHeightPx: preset.frameHeightPx,
    });
  },
  setCameraFrameWidthPx: (widthPx) =>
    set({
      cameraFrameWidthPx: clampCameraFramePx(widthPx),
    }),
  setCameraFrameHeightPx: (heightPx) =>
    set({
      cameraFrameHeightPx: clampCameraFramePx(heightPx),
    }),
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
      timeAnchorIsPlanned: false,
      ephemerisRefetchKey: s.ephemerisRefetchKey + 1,
    });
  },
  setTimeAnchorPlanned: (anchorMs) => {
    if (!Number.isFinite(anchorMs) || anchorMs <= 0) {
      return;
    }
    const s = get();
    set({
      timeAnchorMs: anchorMs,
      timeOffsetMs: 0,
      referenceEpochMs: anchorMs,
      timeAnchorIsPlanned: true,
      ephemerisRefetchKey: s.ephemerisRefetchKey + 1,
    });
  },
  tickLiveTime: () => {
    const s = get();
    if (s.timeOffsetMs !== 0 || s.timeAnchorIsPlanned) return;
    const now = Date.now();
    const prevRef = s.referenceEpochMs;
    const crossedDay =
      prevRef > 0 &&
      utcCalendarDayStartMs(now) !== utcCalendarDayStartMs(prevRef);
    set({
      timeAnchorMs: now,
      referenceEpochMs: now,
      ephemerisRefetchKey: crossedDay
        ? s.ephemerisRefetchKey + 1
        : s.ephemerisRefetchKey,
    });
  },
  setMapView: (next) =>
    set((s) => ({ mapView: { ...s.mapView, ...next } })),
  mapAircraftAltitudeColors: true,
  setMapAircraftAltitudeColors: (enabled) =>
    set({ mapAircraftAltitudeColors: enabled }),
  flightAltitudeLegendUnit: "ft",
  setFlightAltitudeLegendUnit: (unit) =>
    set({ flightAltitudeLegendUnit: unit }),
  altitudeBandIndex: 0,
  setAltitudeBandIndex: (i) => set({ altitudeBandIndex: i }),
  mapDisplayMode: "2d",
  setMapDisplayMode: (mode) => set({ mapDisplayMode: mode }),
  flightHistoryHeatmap: false,
  setFlightHistoryHeatmap: (v) => set({ flightHistoryHeatmap: v }),
  flightHistoryHourFilter: null,
  setFlightHistoryHourFilter: (f) => set({ flightHistoryHourFilter: f }),
  flightHistoryRoutes: false,
  setFlightHistoryRoutes: (v) => set({ flightHistoryRoutes: v }),
  airportRunwayOverlay: false,
  setAirportRunwayOverlay: (v) => set({ airportRunwayOverlay: v }),
  flightLogSelectedIcao24: null,
  flightLogDaysBack: 7,
  setFlightLogSelected: (icao24, days) =>
    set((s) => ({
      flightLogSelectedIcao24: icao24,
      flightLogDaysBack: days ?? s.flightLogDaysBack,
    })),
  setFlightLogDaysBack: (days) => set({ flightLogDaysBack: days }),
  flightLogSelectedCallsign: null,
  setFlightLogSelectedCallsign: (callsign, days) =>
    set((s) => ({
      flightLogSelectedCallsign: callsign,
      flightLogDaysBack: days ?? s.flightLogDaysBack,
      // Prediction/profile belong to the previous callsign — clear until the new fetch lands
      flightLogNextPass: null,
      flightLogAltitude: null,
    })),
  flightLogNextPass: null,
  setFlightLogNextPass: (p) => set({ flightLogNextPass: p }),
  flightLogAltitude: null,
  setFlightLogAltitude: (a) => set({ flightLogAltitude: a }),
  setFlightProvider: (id) =>
    set((s) => {
      let liveFlightFeeds = s.liveFlightFeeds;
      if (id === "opensky") {
        liveFlightFeeds = { ...s.liveFlightFeeds, opensky: true, adsbone: false };
      } else if (id === "adsbone") {
        liveFlightFeeds = { ...s.liveFlightFeeds, opensky: false, adsbone: true };
      }
      const sameProvider = s.flightProvider === id;
      const feedsUnchanged =
        liveFlightFeeds.opensky === s.liveFlightFeeds.opensky &&
        liveFlightFeeds.adsbone === s.liveFlightFeeds.adsbone;
      if (sameProvider && feedsUnchanged) {
        return {};
      }
      clearOpenSkyFlightRetention();
      return {
        flightProvider: id,
        liveFlightFeeds,
        selectedFlightId: null,
      };
    }),
  setLiveFlightFeeds: (patch) =>
    set((s) => {
      if (s.flightProvider !== "opensky" && s.flightProvider !== "adsbone") {
        return {};
      }
      const next = {
        opensky: patch.opensky ?? s.liveFlightFeeds.opensky,
        adsbone: patch.adsbone ?? s.liveFlightFeeds.adsbone,
        localsdr: patch.localsdr ?? s.liveFlightFeeds.localsdr,
        avionix: patch.avionix ?? s.liveFlightFeeds.avionix,
      };
      if (!next.opensky && !next.adsbone && !next.localsdr && !next.avionix) {
        return {};
      }
      const unchanged =
        next.opensky === s.liveFlightFeeds.opensky &&
        next.adsbone === s.liveFlightFeeds.adsbone &&
        next.localsdr === s.liveFlightFeeds.localsdr &&
        next.avionix === s.liveFlightFeeds.avionix;
      if (unchanged) {
        return {};
      }
      clearOpenSkyFlightRetention();
      let flightProvider = s.flightProvider;
      if (next.opensky && !next.adsbone) {
        flightProvider = "opensky";
      } else if (!next.opensky && next.adsbone) {
        flightProvider = "adsbone";
      } else if (next.opensky && next.adsbone) {
        flightProvider = "opensky";
      }
      return {
        liveFlightFeeds: next,
        flightProvider,
        selectedFlightId: null,
      };
    }),
  ensureFlightSourceComboboxMode: () =>
    set((s) => {
      if (s.flightProvider !== "static") {
        return {};
      }
      clearOpenSkyFlightRetention();
      return {
        flightProvider: "opensky",
        liveFlightFeeds: {
          opensky: true,
          adsbone: true,
          localsdr: s.liveFlightFeeds.localsdr,
          avionix: s.liveFlightFeeds.avionix,
        },
        selectedFlightId: null,
      };
    }),
  setSelectedFlightId: (id) => set({ selectedFlightId: id }),
  setFlights: (f) => set({ flights: f }),
  pruneFlightsToObserverRadius: (observerLat, observerLng, radiusKm) => {
    const limitM = radiusKm * 1000;
    set((s) => ({
      flights: s.flights.filter((f) =>
        greatCircleDistanceMeters(
          observerLat, observerLng,
          f.position.lat, f.position.lng
        ) <= limitM
      ),
    }));
  },
  patchFlightAircraftTypeFromIndex: (flightId, aircraftType, dimensions) => {
    const t = aircraftType.trim();
    if (!t && !dimensions) {
      return;
    }
    set((s) => ({
      flights: s.flights.map((f) => {
        if (f.id !== flightId) {
          return f;
        }
        // Popuni samo praznine — izvor (provider) ima prednost pred indeksom.
        const nextType = f.aircraftType?.trim() ? f.aircraftType : t || f.aircraftType;
        const nextWingspan = f.wingspanMeters ?? dimensions?.wingspanMeters ?? null;
        const nextLength = f.lengthMeters ?? dimensions?.lengthMeters ?? null;
        if (
          nextType === f.aircraftType &&
          nextWingspan === (f.wingspanMeters ?? null) &&
          nextLength === (f.lengthMeters ?? null)
        ) {
          return f;
        }
        return {
          ...f,
          aircraftType: nextType,
          wingspanMeters: nextWingspan,
          lengthMeters: nextLength,
        };
      }),
    }));
  },
  resetError: () => set({ error: null }),
  loadFlightsInBounds: async (bounds, opts) => {
    set({ isLoading: true, error: null });
    try {
      const fp = get().flightProvider;
      const previousFlights = get().flights;
      const observer = useObserverStore.getState().observer;
      const query = { bounds, observer };

      if (fp === "static" || fp === "mock") {
        const p = getFlightProvider(fp);
        const flights = await p.getFlightsInBounds(query);
        const merged = mergeFlightsWithOpenSkyRetention(
          flights,
          previousFlights,
          {
            providerId: fp,
            mapBounds: bounds,
            nowMs: Date.now(),
            openSkyLatencySkewMs: get().openSkyLatencySkewMs,
          }
        );
        const sel = get().selectedFlightId;
        const keepSel =
          sel != null && merged.some((f) => f.id === sel);
        set({
          flights: merged,
          localsdrStatus: "idle",
          avionixStatus: "idle",
          isLoading: false,
          ...(keepSel ? {} : { selectedFlightId: null }),
        });
        return;
      }

      const feeds = get().liveFlightFeeds;
      /**
       * Brzi tick: samo jedan lokalni izvor (localsdr ILI avionix), web izvori
       * se preskaču (ne troše kvotu). Drugi lokalni izvor nije osvježen taj
       * tick — njegovo zadnje stanje već živi u `previousFlights`.
       */
      const localOnly = opts?.only;
      const localOnlyActive = localOnly != null && feeds[localOnly];
      const ids: ("opensky" | "adsbone")[] = [];
      if (!localOnlyActive) {
        if (feeds.opensky) ids.push("opensky");
        if (feeds.adsbone) ids.push("adsbone");
        // fallback samo ako nijedan lokalni izvor nije uključen — local-only mod je valjan
        if (ids.length === 0 && !feeds.localsdr && !feeds.avionix) ids.push("opensky");
      }

      // Track reachability separately from the (silently caught) result so
      // the UI can tell "receiver has 0 aircraft" apart from "receiver unreachable".
      let sdrReachable = true;
      const sdrPromise: Promise<readonly FlightState[]> =
        feeds.localsdr && (!localOnly || localOnly === "localsdr")
          ? getFlightProvider("localsdr").getFlightsInBounds(query).catch((e) => {
              sdrReachable = false;
              console.warn("[MoonTransit] localsdr upstream unreachable:", e instanceof Error ? e.message : e);
              return [];
            })
          : Promise.resolve([]);

      let avionixReachable = true;
      const avionixPromise: Promise<readonly FlightState[]> =
        feeds.avionix && (!localOnly || localOnly === "avionix")
          ? getFlightProvider("avionix").getFlightsInBounds(query).catch((e) => {
              avionixReachable = false;
              console.warn("[MoonTransit] avionix upstream unreachable:", e instanceof Error ? e.message : e);
              return [];
            })
          : Promise.resolve([]);

      const [settled, sdrList, avionixList] = await Promise.all([
        Promise.allSettled(
          ids.map((id) => getFlightProvider(id).getFlightsInBounds(query))
        ),
        sdrPromise,
        avionixPromise,
      ]);

      // Status se preračunava samo za izvor koji je stvarno pitan ovaj tick —
      // kad je `localOnly` postavljen na drugi izvor, taj izvor zadržava
      // zadnje poznato stanje (store ga ovaj tick jednostavno ne zna).
      const sdrRanThisTick = feeds.localsdr && (!localOnly || localOnly === "localsdr");
      const localsdrStatus: "idle" | "ok" | "unreachable" = !feeds.localsdr
        ? "idle"
        : !sdrRanThisTick
          ? get().localsdrStatus
          : sdrReachable
            ? "ok"
            : "unreachable";
      const avionixRanThisTick = feeds.avionix && (!localOnly || localOnly === "avionix");
      const avionixStatus: "idle" | "ok" | "unreachable" = !feeds.avionix
        ? "idle"
        : !avionixRanThisTick
          ? get().avionixStatus
          : avionixReachable
            ? "ok"
            : "unreachable";

      if (localOnlyActive) {
        // Brzi tick: web izvori nisu ni pitani. Zadnji poznati web letovi žive
        // dalje kao `previousFlights` — lokalni izvor ima prioritet za
        // geometriju, web popunjava metapodatke. Njihovo starenje i dalje
        // ograničava web tick (retention u `mergeFlightsWithOpenSkyRetention`, 32 s).
        const freshList = localOnly === "localsdr" ? sdrList : avionixList;
        const combined = mergeLiveFlightListsWithSdrPriority(freshList, [
          previousFlights,
        ]);
        const prevCounts = get().providerFlightCounts;
        const sel = get().selectedFlightId;
        set({
          flights: combined,
          providerFlightCounts: { ...prevCounts, [localOnly]: freshList.length },
          localsdrStatus,
          avionixStatus,
          isLoading: false,
          ...(sel != null && combined.some((f) => f.id === sel)
            ? {}
            : { selectedFlightId: null }),
        });
        return;
      }

      const lists: (readonly FlightState[])[] = [];
      const errors: string[] = [];
      const rawCounts: { opensky: number; adsbone: number } = { opensky: 0, adsbone: 0 };
      const webFeedStatus: { opensky: WebFeedStatus; adsbone: WebFeedStatus } = {
        opensky: feeds.opensky ? "error" : "idle",
        adsbone: feeds.adsbone ? "error" : "idle",
      };
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") {
          lists.push(r.value);
          rawCounts[ids[i]] = r.value.length;
          webFeedStatus[ids[i]] = "ok";
        } else {
          const msg =
            r.reason instanceof Error ? r.reason.message : String(r.reason);
          errors.push(`${ids[i]}: ${msg}`);
          webFeedStatus[ids[i]] = webFeedStatusFromError(r.reason);
        }
      });

      // Lokalni izvori se spajaju međusobno prije nego pobijede web — oba
      // (localsdr, avionix) su podjednako pouzdana vlastita hardver; noviji
      // `timestamp` pobjeđuje za icao24 koji vide oba (isto ponašanje kao za
      // više web listi u `mergeLiveFlightLists`).
      const combinedLocal = mergeLiveFlightLists([sdrList, avionixList]);

      // Local-only mod: oba weba isključena, lokalni izvor(i) su jedini izvor
      if (lists.length === 0 && combinedLocal.length > 0) {
        const merged = mergeFlightsWithOpenSkyRetention(
          combinedLocal,
          previousFlights,
          {
            // Retention gate izuzima sve providerId osim opensky/adsbone —
            // "localsdr" ovdje samo označava "lokalni, bez retencije".
            providerId: "localsdr",
            mapBounds: bounds,
            nowMs: Date.now(),
            openSkyLatencySkewMs: get().openSkyLatencySkewMs,
          }
        );
        const sel = get().selectedFlightId;
        set({
          flights: merged,
          providerFlightCounts: {
            opensky: 0,
            adsbone: 0,
            localsdr: sdrList.length,
            avionix: avionixList.length,
          },
          localsdrStatus,
          avionixStatus,
          webFeedStatus,
          isLoading: false,
          ...(sel != null && merged.some((f) => f.id === sel)
            ? {}
            : { selectedFlightId: null }),
        });
        return;
      }

      // Local-only mod ali lokalni popisi prazni (prijemnik nema aviona ili API nije dostupan)
      if (lists.length === 0 && (feeds.localsdr || feeds.avionix)) {
        set({
          flights: [],
          providerFlightCounts: { opensky: 0, adsbone: 0, localsdr: 0, avionix: 0 },
          localsdrStatus,
          avionixStatus,
          webFeedStatus,
          isLoading: false,
          selectedFlightId: null,
        });
        return;
      }

      if (lists.length === 0) {
        throw new Error(errors.join("; ") || "No flight data");
      }
      if (errors.length > 0) {
        console.warn("[MoonTransit] Live flight source partial failure", errors);
      }

      const webMerged =
        lists.length === 1 ? lists[0] : mergeLiveFlightLists(lists);
      const combined =
        combinedLocal.length > 0
          ? mergeLiveFlightListsWithSdrPriority(combinedLocal, lists)
          : webMerged;
      const retentionId: FlightProviderId = ids.includes("opensky")
        ? "opensky"
        : "adsbone";
      const merged = mergeFlightsWithOpenSkyRetention(
        combined,
        previousFlights,
        {
          providerId: retentionId,
          mapBounds: bounds,
          nowMs: Date.now(),
          openSkyLatencySkewMs: get().openSkyLatencySkewMs,
        }
      );
      const sel = get().selectedFlightId;
      const keepSel =
        sel != null && merged.some((f) => f.id === sel);
      set({
        flights: merged,
        providerFlightCounts: {
          ...rawCounts,
          localsdr: sdrList.length,
          avionix: avionixList.length,
        },
        localsdrStatus,
        avionixStatus,
        webFeedStatus,
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
