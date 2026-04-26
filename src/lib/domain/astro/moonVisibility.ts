import type { MoonRiseSetTimes, MoonState } from "@/types/moon";
import { AstroService } from "./astroService";

/**
 * Isti kriterij kao `getMoonPosition` s refraction: `altitudeDeg` je iznad
 * aproks. geometrijskog obzora kad je &gt; 0.
 */
export function isMoonAboveHorizonFromAltitude(altitudeDeg: number): boolean {
  return altitudeDeg > 0;
}

/**
 * Deterministična provjera za trenutak simulacije (preporučeno za UI i mapu):
 * nadmorska visina iz ephemera za `epochMs` i promatrača.
 */
export function isMoonVisibleForEpoch(
  epochMs: number,
  observerLat: number,
  observerLng: number
): boolean {
  const st = AstroService.getMoonState(
    new Date(epochMs),
    observerLat,
    observerLng
  );
  return isMoonAboveHorizonFromAltitude(st.altitudeDeg);
}

/**
 * Provjera pomoću vremena izlaza/zlaza za jedan suncalčev ciklus
 * (ne rješava rubne slučajeve kao što je visina; za to koristi
 * `isMoonVisibleForEpoch` ili `isMoonAboveHorizonFromAltitude` na
 * `MoonState`).
 */
export function isMoonVisibleByRiseSet(
  at: Date,
  times: MoonRiseSetTimes
): boolean {
  if (times.kind === "alwaysUp") {
    return true;
  }
  if (times.kind === "alwaysDown") {
    return false;
  }
  const t = at.getTime();
  const r = times.rise?.getTime() ?? null;
  const s = times.set?.getTime() ?? null;
  if (r != null && s != null) {
    if (r <= s) {
      return t >= r && t <= s;
    }
    return t >= r || t <= s;
  }
  return false;
}

/**
 * Ista semantika vidljivosti kao `isMoonVisibleForEpoch` kada je
 * `MoonState` već učitani.
 */
export function isMoonVisibleFromMoonState(moon: Pick<MoonState, "altitudeDeg">): boolean {
  return isMoonAboveHorizonFromAltitude(moon.altitudeDeg);
}
