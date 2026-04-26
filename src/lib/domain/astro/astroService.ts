import type { MoonState } from "@/types";
import { getMoonState } from "./moon";

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
} as const;
