const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";

type OpenMeteoHourly = {
  hourly?: {
    time?: string[];
    cloud_cover?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
};

/**
 * Pronalazi najbliži sat s valjanom `cloud_cover` vrijednošću u odnosu na `timestampMs`.
 */
function pickCloudCoverForInstant(
  times: string[],
  covers: (number | null)[],
  timestampMs: number
): number | null {
  if (times.length === 0 || times.length !== covers.length) {
    return null;
  }
  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const v = covers[i];
    if (v == null || Number.isNaN(v)) {
      continue;
    }
    const t = Date.parse(times[i]);
    if (Number.isNaN(t)) {
      continue;
    }
    const d = Math.abs(t - timestampMs);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) {
    return null;
  }
  return Math.round(covers[bestIdx]!);
}

/**
 * Satni `cloud_cover` (0–100 %) s Open-Meteo Forecast API-ja za zadane WGS84 koordinate
 * i referentni trenutak planiranja.
 */
export async function getCloudCover(
  lat: number,
  lng: number,
  timestampMs: number,
  signal?: AbortSignal
): Promise<number | null> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(timestampMs)
  ) {
    return null;
  }

  const d = new Date(timestampMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toYmd = (date: Date) =>
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
      date.getUTCDate()
    )}`;

  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 1);

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: "cloud_cover",
    timezone: "auto",
    start_date: toYmd(start),
    end_date: toYmd(end),
  });

  const url = `${OPEN_METEO_FORECAST}?${params.toString()}`;
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as OpenMeteoHourly;
  if (data.error) {
    return null;
  }

  const time = data.hourly?.time;
  const cover = data.hourly?.cloud_cover;
  if (!time || !cover) {
    return null;
  }

  return pickCloudCoverForInstant(time, cover, timestampMs);
}
