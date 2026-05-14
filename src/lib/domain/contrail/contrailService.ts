export type ContrailLikelihood = "none" | "transient" | "persistent";

export interface AtmosphericLevel {
  pressureHPa: number;
  tempC: number;
  /** Relative humidity w.r.t. liquid water, 0–100 %. */
  rhPercent: number;
}

/** ISA pressure (hPa) from geometric altitude (m). */
function altToApproxPressureHPa(altM: number): number {
  if (altM <= 11000) {
    return 1013.25 * Math.pow(1 - 2.25577e-5 * altM, 5.2561);
  }
  return 226.32 * Math.exp(-1.5769e-4 * (altM - 11000));
}

/** Magnus formula: saturation vapor pressure over liquid water (hPa). */
function eSatWater(tempC: number): number {
  return 6.1078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/** Magnus-type: saturation vapor pressure over ice (hPa). */
function eSatIce(tempC: number): number {
  return 6.1078 * Math.exp((21.8745584 * tempC) / (tempC + 265.5));
}

/** RH w.r.t. ice from RH w.r.t. liquid water. */
function rhIcePercent(rhWaterPct: number, tempC: number): number {
  if (tempC >= 0) return rhWaterPct;
  return rhWaterPct * (eSatWater(tempC) / eSatIce(tempC));
}

/**
 * Simplified Schmidt-Appleman criterion for contrail formation.
 *
 * Returns:
 *  - "none"       — conditions do not favour contrail formation
 *  - "transient"  — contrail forms but sublimes quickly (RH_ice < 100 %)
 *  - "persistent" — contrail persists / spreads (RH_ice ≥ 100 %)
 */
export function computeContrailLikelihood(
  altM: number | null,
  levels: AtmosphericLevel[]
): ContrailLikelihood {
  if (altM == null || altM < 5000 || levels.length === 0) return "none";

  const pressHPa = altToApproxPressureHPa(altM);

  let best = levels[0];
  let bestDist = Math.abs(best.pressureHPa - pressHPa);
  for (const lv of levels) {
    const d = Math.abs(lv.pressureHPa - pressHPa);
    if (d < bestDist) {
      bestDist = d;
      best = lv;
    }
  }

  // Schmidt-Appleman threshold: contrail forms below ~-38 °C at typical
  // cruise pressures with kerosene engines (eta ≈ 0.30, EI_H2O = 1.25).
  const SAC_THRESHOLD_C = -38;
  if (best.tempC > SAC_THRESHOLD_C) return "none";

  const rhIce = rhIcePercent(best.rhPercent, best.tempC);
  return rhIce >= 100 ? "persistent" : "transient";
}
