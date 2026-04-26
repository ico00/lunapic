import type { MoonPathSample, MoonState } from "@/types";
import type { MoonRiseSetTimes } from "@/types/moon";
import { getMoonState } from "./moon";
import { getMoonRiseSetForObserverDay } from "./moonTimes";

/** 24 samples × 30 min = 12 h forward from the reference instant (used as fallback if rise/set nisu još u storeu). */
export const MOON_PATH_SAMPLE_COUNT = 24;
export const MOON_PATH_STEP_MS = 30 * 60 * 1000;

/**
 * Polumjer starog vremenskog klizača (±6h od središta) — 12h ukupno u fallback modu.
 * `t1 - t0 = 2 * TIME_SLIDER_6H_HALF_MS`.
 */
export const TIME_SLIDER_6H_HALF_MS = 6 * 60 * 60 * 1000;

/**
 * Geometrijski prozor za luk na karti (rise→set, circumpolar 24h UTC, 12h naprijed
 * uz „normal” bez učitane parove). Uvijek ispod: `null` (nema luka).
 */
export function getMoonPathVisibilityWindowMs(
  referenceEpochMs: number,
  riseSet: MoonRiseSetTimes
): { t0: number; t1: number } | null {
  if (riseSet.kind === "alwaysDown") {
    return null;
  }
  if (riseSet.kind === "alwaysUp") {
    const d = new Date(referenceEpochMs);
    const t0 = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      0,
      0,
      0,
      0
    );
    return { t0, t1: t0 + 24 * 60 * 60 * 1000 - 1 };
  }
  if (riseSet.rise != null && riseSet.set != null) {
    const t0 = riseSet.rise.getTime();
    let t1 = riseSet.set.getTime();
    if (t1 <= t0) {
      t1 += 24 * 60 * 60 * 1000;
    }
    return { t0, t1 };
  }
  const t1 =
    referenceEpochMs + (MOON_PATH_SAMPLE_COUNT - 1) * MOON_PATH_STEP_MS;
  return { t0: referenceEpochMs, t1 };
}

/**
 * Prozor za vremenski klizač: [moonrise, moonset] (ili 24h za circumpolar) kad
 * su podaci spremni; inače 12h (`±6h` od središta) oko lijevog ruba `timeAnchorLeftMs`
 * (npr. nakon `sync` = `now-6h` … `now+6h`). `timeAnchorLeftMs` nije korišten
 * za rise/set, samo u fallbacku.
 */
export function getTimeSliderWindowMs(
  referenceEpochMs: number,
  timeAnchorLeftMs: number,
  riseSet: MoonRiseSetTimes
): { t0: number; t1: number } {
  if (
    riseSet.kind === "alwaysDown" ||
    (riseSet.kind === "normal" &&
      (riseSet.rise == null || riseSet.set == null))
  ) {
    return {
      t0: timeAnchorLeftMs,
      t1: timeAnchorLeftMs + 2 * TIME_SLIDER_6H_HALF_MS,
    };
  }
  const w = getMoonPathVisibilityWindowMs(referenceEpochMs, riseSet);
  if (w) {
    return w;
  }
  return {
    t0: timeAnchorLeftMs,
    t1: timeAnchorLeftMs + 2 * TIME_SLIDER_6H_HALF_MS,
  };
}

/** Izlaz: uzorci luka, te [t0,t1] za satne oznake; null = nema luka (Mjesec cijeli dan ispod). */
export type MoonPathMapSpec = {
  readonly samples: readonly MoonPathSample[];
  /** Inclusive: od moonrise do moonset, ili 24h UTC dan za circumpolar. */
  readonly labelWindowMs: { readonly t0: number; readonly t1: number } | null;
};

/**
 * Uzorci s korakom `stepMs` na [t0Ms, t1LastMs] (završetak uključivo ako ne pada na mrežu).
 * Čisto, bez Reacta — vidljivo za testove.
 */
export function buildMoonPathSamplesInTimeRange(
  t0Ms: number,
  t1LastMs: number,
  stepMs: number,
  observerLat: number,
  observerLng: number
): MoonPathSample[] {
  if (
    !Number.isFinite(t0Ms) ||
    !Number.isFinite(t1LastMs) ||
    t1LastMs < t0Ms
  ) {
    return [];
  }
  const out: MoonPathSample[] = [];
  const maxN = 2000;
  for (let t = t0Ms, n = 0; t <= t1LastMs + 1e-6 && n < maxN; t += stepMs, n++) {
    const m = getMoonState(new Date(t), observerLat, observerLng);
    out.push({
      epochMs: t,
      azimuthDeg: m.azimuthDeg,
      altitudeDeg: m.altitudeDeg,
    });
  }
  const last = out[out.length - 1];
  if (last == null) {
    return out;
  }
  if (last.epochMs < t1LastMs - 0.5) {
    const m = getMoonState(new Date(t1LastMs), observerLat, observerLng);
    out.push({
      epochMs: t1LastMs,
      azimuthDeg: m.azimuthDeg,
      altitudeDeg: m.altitudeDeg,
    });
  }
  return out;
}

/**
 * Tanki servis (facade) iznad ephemeris funkcija — karta / UI ovise o ovom imenu, ne o Suncalca detaljima.
 */
export const AstroService = {
  getMoonState(
    at: Date,
    observerLat: number,
    observerLng: number
  ): MoonState {
    return getMoonState(at, observerLat, observerLng);
  },

  /**
   * Izlaz i zlaz Mjeseca za kalendaru dan koji sadrži `date` (UTC ponoć),
   * s obzirom na suncalc i poziciju promatrača.
   */
  getMoonTimes(
    date: Date,
    lat: number,
    lng: number
  ): MoonRiseSetTimes {
    return getMoonRiseSetForObserverDay(date, lat, lng, true);
  },

  /**
   * 24 points every 30 minutes for the next 12 h from `referenceEpochMs` (inclusive of t₀).
   */
  getMoonPathSamples(
    referenceEpochMs: number,
    observerLat: number,
    observerLng: number
  ): readonly MoonPathSample[] {
    const out: MoonPathSample[] = [];
    for (let i = 0; i < MOON_PATH_SAMPLE_COUNT; i++) {
      const t = referenceEpochMs + i * MOON_PATH_STEP_MS;
      const m = getMoonState(new Date(t), observerLat, observerLng);
      out.push({
        epochMs: t,
        azimuthDeg: m.azimuthDeg,
        altitudeDeg: m.altitudeDeg,
      });
    }
    return out;
  },

  /**
   * Luk mjeseceve putanje samo u prozoru vidljivosti: [moonrise, moonset] (isti kotiran kao u UI),
   * te za circumpolar cijeli UTC dan, za alwaysDown prazan niz. Kad `kind === "normal"` a rise/set
   * još nisu učitani, koristi 12h fallback kao prije.
   */
  getMoonPathMapSpec(
    referenceEpochMs: number,
    observerLat: number,
    observerLng: number,
    riseSet: MoonRiseSetTimes
  ): MoonPathMapSpec {
    const w = getMoonPathVisibilityWindowMs(referenceEpochMs, riseSet);
    if (w == null) {
      return { samples: [], labelWindowMs: null };
    }
    const samples = buildMoonPathSamplesInTimeRange(
      w.t0,
      w.t1,
      MOON_PATH_STEP_MS,
      observerLat,
      observerLng
    );
    return { samples, labelWindowMs: w };
  },
} as const;
