/**
 * NASA SVS “Moon Phase and Libration” hourly stills (730×730, north up).
 * @see https://svs.gsfc.nasa.gov/gallery/moonphase.html
 *
 * Frame `moon.0001.jpg` is the first hour of the calendar year in UT; sequence length
 * is 8760 for common years and 8784 for leap years (verified against published frame sets).
 */

const NASA_MOON_730_BASE_BY_YEAR: Readonly<Record<number, string>> = {
  2023: "https://svs.gsfc.nasa.gov/vis/a000000/a005000/a005048/frames/730x730_1x1_30p",
  2024: "https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005187/frames/730x730_1x1_30p",
  2025: "https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005415/frames/730x730_1x1_30p",
  2026: "https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/frames/730x730_1x1_30p",
} as const;

const MIN_CATALOG_YEAR = 2023;
const MAX_CATALOG_YEAR = 2026;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

/** Inclusive upper bound on `moon.NNNN.jpg` index for that catalog year. */
export function nasaMoonPhaseMaxFrameForYear(year: number): number {
  return isLeapYear(year) ? 8784 : 8760;
}

/**
 * When the simulated year is outside [2023, 2026], use the nearest catalog year but keep
 * month / day / hour (UT). Invalid calendar dates (e.g. Feb 29 → non-leap) roll backward.
 */
export function catalogUtcMsForNasaMoonFrame(simulatedUtcMs: number): {
  readonly catalogYear: number;
  readonly utcMs: number;
} {
  const d = new Date(simulatedUtcMs);
  const catalogYear = clamp(
    d.getUTCFullYear(),
    MIN_CATALOG_YEAR,
    MAX_CATALOG_YEAR
  );
  const utcMs = safeUtcPreserveFields(
    catalogYear,
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours()
  );
  return { catalogYear, utcMs };
}

function safeUtcPreserveFields(
  year: number,
  month: number,
  day: number,
  hour: number
): number {
  let d = day;
  for (let attempt = 0; attempt < 8; attempt++) {
    const t = Date.UTC(year, month, d, hour, 0, 0, 0);
    const check = new Date(t);
    if (
      check.getUTCFullYear() === year &&
      check.getUTCMonth() === month &&
      check.getUTCDate() === d
    ) {
      return t;
    }
    d -= 1;
  }
  return Date.UTC(year, month, 1, hour, 0, 0, 0);
}

/**
 * Absolute URL to the SVS JPEG for the simulated instant (hourly resolution, UT).
 */
export function nasaMoonPhaseFrameJpgUrl(simulatedUtcMs: number): string {
  const { catalogYear, utcMs } = catalogUtcMsForNasaMoonFrame(simulatedUtcMs);
  const base = NASA_MOON_730_BASE_BY_YEAR[catalogYear];
  if (!base) {
    throw new Error(`No NASA moon frame base for year ${catalogYear}`);
  }
  const yearStart = Date.UTC(catalogYear, 0, 1, 0, 0, 0, 0);
  const hourIndex = Math.floor((utcMs - yearStart) / 3_600_000);
  const maxFrame = nasaMoonPhaseMaxFrameForYear(catalogYear);
  const frame = clamp(hourIndex + 1, 1, maxFrame);
  return `${base}/moon.${String(frame).padStart(4, "0")}.jpg`;
}
