import * as Astronomy from "astronomy-engine";
import type { MoonPosition, MoonState } from "@/types";

const MOON_MEAN_RADIUS_KM = 1737.4;

/**
 * Moon state for the observer at a given time.
 * Uses astronomy-engine (USNO-grade, <1 arcminute accuracy) instead of the
 * simplified SunCalc lunar theory that was off by up to ~0.5°.
 */
/**
 * Position only — no phase, no illumination.
 *
 * This is the half that geometry needs and the cheap half by a wide margin:
 * the two calls below cost ~33 % of a full `getMoonState`, the phase half the
 * other ~67 % (`MoonPhase` plus two more `Equator` calls, one of them for the
 * Sun). `solveMoonShadowSpot` evaluates the Moon once per Newton step over
 * tens of thousands of candidate points per request and reads only altitude,
 * azimuth and apparent radius, so paying for phase there was pure waste —
 * measured at 846 ms, a third of a cold `photo-spots` request.
 *
 * Same inputs and same arithmetic as `getMoonState`; the fields it returns are
 * bit-identical.
 */
export function getMoonPosition(
  at: Date,
  observerLat: number,
  observerLng: number,
  observerElevM = 0
): MoonPosition {
  const observer = new Astronomy.Observer(observerLat, observerLng, observerElevM);

  // Equatorial coordinates with aberration + light-time correction, geocentric→topocentric
  const eq = Astronomy.Equator(Astronomy.Body.Moon, at, observer, true, true);

  // Horizontal coordinates with atmospheric refraction ("normal" = standard model)
  const hor = Astronomy.Horizon(at, observer, eq.ra, eq.dec, "normal");

  const distKm = eq.dist * 149597870.7; // AU → km
  const apparentRadiusDeg = (Math.atan(MOON_MEAN_RADIUS_KM / distKm) * 180) / Math.PI;

  return {
    altitudeDeg: hor.altitude,
    azimuthDeg: hor.azimuth,
    distanceKm: distKm,
    apparentRadius: { degrees: apparentRadiusDeg },
  };
}

export function getMoonState(
  at: Date,
  observerLat: number,
  observerLng: number,
  observerElevM = 0
): MoonState {
  const position = getMoonPosition(at, observerLat, observerLng, observerElevM);
  const observer = new Astronomy.Observer(observerLat, observerLng, observerElevM);

  const ill = Astronomy.MoonPhase(at);
  // MoonPhase returns ecliptic longitude difference [0,360); map to [0,1) phase fraction
  const phaseFraction = ill / 360;

  // Illumination fraction from elongation
  const moonEq = Astronomy.Equator(Astronomy.Body.Moon, at, observer, false, true);
  const sunEq  = Astronomy.Equator(Astronomy.Body.Sun,  at, observer, false, true);
  const elongRad =
    Math.acos(
      Math.sin((moonEq.dec * Math.PI) / 180) * Math.sin((sunEq.dec * Math.PI) / 180) +
      Math.cos((moonEq.dec * Math.PI) / 180) *
        Math.cos((sunEq.dec * Math.PI) / 180) *
        Math.cos(((moonEq.ra - sunEq.ra) * Math.PI) / 12)
    );
  const illuminationFraction = (1 - Math.cos(elongRad)) / 2;

  return { ...position, phaseFraction, illuminationFraction };
}
