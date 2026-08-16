import * as Astronomy from "astronomy-engine";

/**
 * Locally rendered lunar phase for the viewfinder.
 *
 * Replaces the NASA SVS hourly stills (`svs.gsfc.nasa.gov`) that the viewfinder used to
 * hotlink: that host went unreachable in 2026-08 and took the moon disk with it, and the
 * published frame sets only covered 2023–2026 anyway. The terminator is cheap geometry —
 * one full-moon texture plus an illumination-driven mask reproduces it for any instant,
 * offline, with no catalog year bound.
 *
 * Known omissions versus the SVS frames: no libration (the disk never wobbles) and no
 * earthshine on the unlit side. Both are invisible at the size the disk is drawn.
 */

const HOURS_TO_RAD = Math.PI / 12;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export type MoonPhaseGeometry = {
  /** Sunlit portion of the disk, 0 (new) → 1 (full). */
  readonly illuminationFraction: number;
  /**
   * Position angle of the bright limb's midpoint, degrees measured from celestial north
   * through east (Meeus, *Astronomical Algorithms* ch. 48). Waxing moons sit near 270°
   * (limb faces west), waning near 90°.
   */
  readonly brightLimbAngleDeg: number;
};

/** Illumination + bright-limb orientation for the geocentric Moon at `at`. */
export function getMoonPhaseGeometry(at: Date): MoonPhaseGeometry {
  // Geocentric on purpose: topocentric parallax shifts the Moon by up to ~1°, which tilts
  // the computed limb angle without telling us anything the disk can show.
  const moon = Astronomy.EquatorFromVector(
    Astronomy.GeoVector(Astronomy.Body.Moon, at, true)
  );
  const sun = Astronomy.EquatorFromVector(
    Astronomy.GeoVector(Astronomy.Body.Sun, at, true)
  );

  const moonRa = moon.ra * HOURS_TO_RAD;
  const moonDec = moon.dec * DEG_TO_RAD;
  const sunRa = sun.ra * HOURS_TO_RAD;
  const sunDec = sun.dec * DEG_TO_RAD;

  const deltaRa = sunRa - moonRa;
  const y = Math.cos(sunDec) * Math.sin(deltaRa);
  const x =
    Math.sin(sunDec) * Math.cos(moonDec) -
    Math.cos(sunDec) * Math.sin(moonDec) * Math.cos(deltaRa);

  return {
    illuminationFraction: Astronomy.Illumination(Astronomy.Body.Moon, at)
      .phase_fraction,
    brightLimbAngleDeg: normalizeDeg(Math.atan2(y, x) * RAD_TO_DEG),
  };
}

/** Wraps to [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * SVG rotation (degrees, clockwise on screen) that carries a lit-on-`+x` phase path onto
 * the real bright-limb direction, for a disk drawn in the camera's alt-az frame.
 *
 * The frame is a sky view: up is the zenith and azimuth increases to the right, which puts
 * celestial east on the *left*. Position angles therefore advance counter-clockwise on
 * screen, and the equatorial angle has to be de-rotated by the parallactic angle first —
 * the same correction {@link ViewfinderPreview} already applies to the aircraft heading.
 *
 * Sanity check: a first-quarter moon on the meridian has `brightLimbAngleDeg` ≈ 270 and
 * `parallacticAngleDeg` ≈ 0, giving rotation ≈ 0 — the lit half stays on `+x`, i.e. the
 * right, which is where a northern-hemisphere observer sees it.
 */
export function moonPhaseRotationDeg(
  brightLimbAngleDeg: number,
  parallacticAngleDeg: number
): number {
  return normalizeDeg(-(brightLimbAngleDeg - parallacticAngleDeg + 90));
}

/**
 * SVG path for the sunlit region of a disk at (`cx`, `cy`) with radius `r`, drawn with the
 * bright limb on `+x`. Rotate it by {@link moonPhaseRotationDeg} to orient it.
 *
 * The lit region is bounded by two arcs meeting at the cusps: the `+x` half of the limb
 * circle, and the terminator — a half-ellipse of semi-axis `r·|1 − 2k|`. The terminator
 * bulges toward `+x` while the moon is a crescent (`k < 0.5`) and away from it once
 * gibbous, degenerating to the straight edge of a quarter moon at `k = 0.5` (SVG renders a
 * zero-radius arc as a line, so no special case is needed).
 */
export function moonPhasePathD(input: {
  cx: number;
  cy: number;
  r: number;
  illuminationFraction: number;
}): string {
  const { cx, cy, r } = input;
  const k = Math.min(1, Math.max(0, input.illuminationFraction));
  const terminatorSemiAxis = r * (1 - 2 * k);
  const terminatorSweep = terminatorSemiAxis >= 0 ? 0 : 1;
  const rx = Math.abs(terminatorSemiAxis);

  return [
    `M ${cx} ${cy - r}`,
    `A ${r} ${r} 0 0 1 ${cx} ${cy + r}`,
    `A ${rx} ${r} 0 0 ${terminatorSweep} ${cx} ${cy - r}`,
    "Z",
  ].join(" ");
}
