import type { MoonPathSample, MoonState } from "@/types";
import { getMoonState } from "./moon";

/** 24 samples × 30 min = 12 h horizon starting at the reference instant. */
export const MOON_PATH_SAMPLE_COUNT = 24;
export const MOON_PATH_STEP_MS = 30 * 60 * 1000;

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
} as const;
