import type { AtmosphericLevel } from "@/lib/domain/contrail/contrailService";

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";

/** Pressure levels fetched for contrail prediction (hPa). */
const PRESSURE_LEVELS_HPA = [300, 250, 200] as const;

type PressureLevel = (typeof PRESSURE_LEVELS_HPA)[number];

type OpenMeteoHourly = {
  hourly?: {
    time?: string[];
    cloud_cover?: (number | null)[];
    temperature_300hPa?: (number | null)[];
    temperature_250hPa?: (number | null)[];
    temperature_200hPa?: (number | null)[];
    relativehumidity_300hPa?: (number | null)[];
    relativehumidity_250hPa?: (number | null)[];
    relativehumidity_200hPa?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
};

export interface WeatherData {
  cloudCoverPercent: number | null;
  atmosphericLevels: AtmosphericLevel[] | null;
}

function pickValueForInstant(
  times: string[],
  values: (number | null)[],
  timestampMs: number
): number | null {
  if (times.length === 0 || times.length !== values.length) return null;
  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) continue;
    const t = Date.parse(times[i]);
    if (Number.isNaN(t)) continue;
    const d = Math.abs(t - timestampMs);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx < 0 ? null : values[bestIdx];
}

function extractAtmosphericLevels(
  hourly: NonNullable<OpenMeteoHourly["hourly"]>,
  timestampMs: number
): AtmosphericLevel[] | null {
  const time = hourly.time;
  if (!time) return null;

  const result: AtmosphericLevel[] = [];

  for (const hpa of PRESSURE_LEVELS_HPA) {
    const tempKey = `temperature_${hpa}hPa` as keyof typeof hourly;
    const rhKey = `relativehumidity_${hpa}hPa` as keyof typeof hourly;
    const tempArr = hourly[tempKey] as (number | null)[] | undefined;
    const rhArr = hourly[rhKey] as (number | null)[] | undefined;
    if (!tempArr || !rhArr) continue;

    const tempC = pickValueForInstant(time, tempArr, timestampMs);
    const rh = pickValueForInstant(time, rhArr, timestampMs);
    if (tempC == null || rh == null) continue;

    result.push({ pressureHPa: hpa as PressureLevel, tempC, rhPercent: rh });
  }

  return result.length > 0 ? result : null;
}

/**
 * Dohvaća oblačnost i atmosferske razine (za contrail predikciju) u jednom
 * Open-Meteo pozivu za zadane WGS84 koordinate i referentni trenutak.
 */
export async function getWeatherData(
  lat: number,
  lng: number,
  timestampMs: number,
  signal?: AbortSignal
): Promise<WeatherData> {
  const empty: WeatherData = {
    cloudCoverPercent: null,
    atmosphericLevels: null,
  };

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(timestampMs)
  ) {
    return empty;
  }

  const d = new Date(timestampMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toYmd = (date: Date) =>
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 1);

  const hourlyVars = [
    "cloud_cover",
    ...PRESSURE_LEVELS_HPA.map((p) => `temperature_${p}hPa`),
    ...PRESSURE_LEVELS_HPA.map((p) => `relativehumidity_${p}hPa`),
  ].join(",");

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: hourlyVars,
    timezone: "auto",
    start_date: toYmd(start),
    end_date: toYmd(end),
  });

  const url = `${OPEN_METEO_FORECAST}?${params.toString()}`;
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) return empty;

  const data = (await res.json()) as OpenMeteoHourly;
  if (data.error) return empty;

  const hourly = data.hourly;
  if (!hourly?.time) return empty;

  const cloudCoverPercent =
    hourly.cloud_cover != null
      ? (() => {
          const v = pickValueForInstant(
            hourly.time!,
            hourly.cloud_cover,
            timestampMs
          );
          return v != null ? Math.round(v) : null;
        })()
      : null;

  const atmosphericLevels = extractAtmosphericLevels(hourly, timestampMs);

  return { cloudCoverPercent, atmosphericLevels };
}

/** Backward-compatible wrapper – dohvaća samo cloud cover. */
export async function getCloudCover(
  lat: number,
  lng: number,
  timestampMs: number,
  signal?: AbortSignal
): Promise<number | null> {
  const data = await getWeatherData(lat, lng, timestampMs, signal);
  return data.cloudCoverPercent;
}
