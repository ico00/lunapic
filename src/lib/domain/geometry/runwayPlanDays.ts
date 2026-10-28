import { getMoonState } from "@/lib/domain/astro/moon";
import { CAUTION_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { LDZA_ELEVATION_M, moonAltitudeAtAirportDeg } from "@/lib/domain/geometry/runwayShadowPlan";
import { LDZA_RUNWAY_04_22_LINE } from "@/lib/map/airportRunwayConfig";

/**
 * Pregled "koji dan vrijedi" za planer: za svaki od idućih dana, kada je
 * Mjesec iznad LDZA dovoljno visoko (≥ `CAUTION_BELOW_DEG`, tj. "optimal" tier
 * iz `moonFieldVisibilityAdvice`) i koliko je osvijetljen.
 *
 * Namjerno **ne** ocjenjuje stazu (04/22), vjetar ni promet — to planer ne zna.
 * Odgovara samo na pitanje "ima li smisla taj dan uopće otvoriti".
 */

const SAMPLE_MINUTES = 10;
/** Kraće od ovoga je prozor koji se ne stigne ni namjestiti. */
const MIN_WINDOW_MINUTES = 30;
/** Početni prozor koji se predlaže kad se klikne dan (planer crta 10 linija po 10 min). */
export const SUGGESTED_WINDOW_MINUTES = 90;

export type PlanningWindow = {
  readonly startMs: number;
  readonly endMs: number;
  readonly startAltitudeDeg: number;
  readonly endAltitudeDeg: number;
};

export type PlanningDay = {
  /** `YYYY-MM-DD` u lokalnoj zoni preglednika (isti ključ kao `PlanningPanel`). */
  readonly dateKey: string;
  readonly dayStartMs: number;
  /** Osvijetljenost diska u sredini prvog prozora (0–1); `null` ako Mjesec nije dovoljno visoko. */
  readonly illuminationFraction: number | null;
  readonly windows: readonly PlanningWindow[];
};

const pad2 = (n: number) => String(n).padStart(2, "0");
export const planningDateKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Prag 04 — Mjesec se evaluira s iste točke kao u planeru. */
const [AIRPORT_LAT, AIRPORT_LNG] = LDZA_RUNWAY_04_22_LINE[LDZA_RUNWAY_04_22_LINE.length - 1]!;

function windowsForDay(dayStartMs: number, dayEndMs: number): PlanningWindow[] {
  const stepMs = SAMPLE_MINUTES * 60_000;
  const out: PlanningWindow[] = [];
  let openStart: number | null = null;
  let openStartAlt = 0;
  let lastMs = dayStartMs;
  let lastAlt = 0;

  const close = () => {
    if (openStart !== null && lastMs - openStart >= MIN_WINDOW_MINUTES * 60_000) {
      out.push({ startMs: openStart, endMs: lastMs, startAltitudeDeg: openStartAlt, endAltitudeDeg: lastAlt });
    }
    openStart = null;
  };

  for (let t = dayStartMs; t < dayEndMs; t += stepMs) {
    const alt = moonAltitudeAtAirportDeg(t);
    if (alt >= CAUTION_BELOW_DEG) {
      if (openStart === null) {
        openStart = t;
        openStartAlt = alt;
      }
      lastMs = t;
      lastAlt = alt;
    } else {
      close();
    }
  }
  close();
  return out;
}

/** Idućih `days` dana od lokalnog dana koji sadrži `fromMs` (prvi je taj dan). */
export function computeBestPlanningDays(fromMs: number, days: number): PlanningDay[] {
  const base = new Date(fromMs);
  const out: PlanningDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i + 1);
    const windows = windowsForDay(start.getTime(), end.getTime());
    const first = windows[0];
    const illuminationFraction = first
      ? getMoonState(
          new Date((first.startMs + first.endMs) / 2),
          AIRPORT_LAT,
          AIRPORT_LNG,
          LDZA_ELEVATION_M
        ).illuminationFraction
      : null;
    out.push({
      dateKey: planningDateKey(start),
      dayStartMs: start.getTime(),
      illuminationFraction,
      windows,
    });
  }
  return out;
}

/** Predloženi prozor za klik na dan: prvih `SUGGESTED_WINDOW_MINUTES` minuta prozora. */
export function suggestedPlanRange(window: PlanningWindow): { startMs: number; endMs: number } {
  return {
    startMs: window.startMs,
    endMs: Math.min(window.endMs, window.startMs + SUGGESTED_WINDOW_MINUTES * 60_000),
  };
}
