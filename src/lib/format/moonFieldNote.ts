import { formatFixed } from "@/lib/format/numbers";

export type MoonFieldNoteMoonInput = {
  altitudeDeg: number;
  azimuthDeg: number;
  apparentRadius: { degrees: number };
  illuminationFraction: number;
};

export function formatMoonFieldNoteText(input: {
  referenceEpochMs: number;
  observerLat: number;
  observerLng: number;
  /** Terrain / manual ground height at the observer (m). */
  observerGroundHeightMeters: number;
  moon: MoonFieldNoteMoonInput;
  moonriseText: string;
  moonsetText: string;
  /** e.g. `Optimal — …` or null */
  visibilitySummary: string | null;
}): string {
  const {
    referenceEpochMs,
    observerLat,
    observerLng,
    observerGroundHeightMeters,
    moon,
    moonriseText,
    moonsetText,
    visibilitySummary,
  } = input;
  const instUtc = new Date(referenceEpochMs).toISOString();
  const instLocal = new Date(referenceEpochMs).toLocaleString("en-GB", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const illum = formatFixed(
    Math.min(1, Math.max(0, moon.illuminationFraction)) * 100,
    0
  );
  const lines = [
    "LunaPic — Moon field note",
    `Simulation instant (UTC): ${instUtc}`,
    `Simulation instant (local): ${instLocal}`,
    `Observer (WGS84): ${formatFixed(observerLat, 5)}°, ${formatFixed(observerLng, 5)}°`,
    `Observer ground elevation (m): ${formatFixed(observerGroundHeightMeters, 0)}`,
    `Moon altitude: ${formatFixed(moon.altitudeDeg)}°`,
    `Moon azimuth (from north): ${formatFixed(moon.azimuthDeg)}°`,
    `Moon angular radius: ${formatFixed(moon.apparentRadius.degrees, 3)}°`,
    `Moon illuminated: ${illum}%`,
    `Moonrise (UTC day): ${moonriseText}`,
    `Moonset (UTC day): ${moonsetText}`,
  ];
  if (visibilitySummary) {
    lines.push(`Field visibility: ${visibilitySummary}`);
  }
  lines.push(
    "",
    "Use with balcony or stand logs. Values follow the app time slider and the fixed observer."
  );
  return lines.join("\n");
}
