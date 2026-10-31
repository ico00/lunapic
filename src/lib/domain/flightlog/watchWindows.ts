import type { RoutePoint } from "@/lib/db/flightLogDb";
import { getMoonPosition } from "@/lib/domain/astro/moon";
import { CAUTION_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { yieldToEventLoop } from "@/lib/domain/flightlog/passForecast";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { geodeticToEcef } from "@/lib/domain/geometry/wgs84";
import type { GroundObserver } from "@/types/geo";
import type { MoonPosition } from "@/types";

/**
 * "Best times to watch": kroz koliko aviona uobičajeno prolazi dio neba na kojem
 * će biti Mjesec. Ne imenuje let, jer pojedini let ne prati raspored dovoljno
 * točno; vidi AGENTS.md ("Što baza može predvidjeti") za mjerenje.
 */

export const WATCH_HISTORY_DAYS = 30;
const WATCH_MAX_SLANT_M = 80_000;
/** Avion niže na nebu ne može stati ispred Mjeseca iznad praga; 2° je za rub ćelije. */
const MIN_AIRCRAFT_ALTITUDE_DEG = CAUTION_BELOW_DEG - 2;
const MAX_FIX_GAP_MS = 45_000;
const CELL_DEG = 2;
const HOUR_BIN = 2;
const HOUR_MS = 3_600_000;
const SLOT_MS = 30 * 60_000;
/** Širina Mjeseca s avionom: prolaz kroz ćeliju od 2° pogodi disk u tom omjeru. */
const MOON_CROSSING_WIDTH_DEG = 0.55;
const BEST_SHARE = 0.1;
const GOOD_SHARE = 0.25;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Ćelija neba u azimutnoj projekciji oko zenita, pa joj širina ne ovisi o visini. */
function skyCell(altitudeDeg: number, azimuthDeg: number): [x: number, y: number] {
  const radius = 90 - altitudeDeg;
  const azimuth = toRad(azimuthDeg);
  return [
    Math.floor((radius * Math.sin(azimuth)) / CELL_DEG),
    Math.floor((radius * Math.cos(azimuth)) / CELL_DEG),
  ];
}

const hourBin = (atMs: number) => Math.floor(new Date(atMs).getUTCHours() / HOUR_BIN);
const densityKey = (x: number, y: number, hour: number) => `${x},${y},${hour}`;

/** Prolazi po ćeliji neba i dvosatnom razdoblju dana (UTC). */
export type SkyDensity = ReadonlyMap<string, number>;

type SkyFix = { altitudeDeg: number; azimuthDeg: number; atMs: number };

function skyFixes(points: readonly RoutePoint[], observer: GroundObserver): SkyFix[] {
  const pObs = geodeticToEcef(observer.lat, observer.lng, observer.groundHeightMeters);
  const fixes: SkyFix[] = [];
  for (const p of points) {
    if (p.alt_baro_m == null) continue;
    const e = geodeticToEcef(p.lat, p.lng, p.alt_baro_m);
    if (Math.hypot(e.x - pObs.x, e.y - pObs.y, e.z - pObs.z) > WATCH_MAX_SLANT_M) continue;
    const { altitudeDeg, azimuthDeg } = horizontalToPoint(observer, p.lat, p.lng, p.alt_baro_m);
    if (altitudeDeg >= MIN_AIRCRAFT_ALTITUDE_DEG) {
      fixes.push({ altitudeDeg, azimuthDeg, atMs: p.logged_at });
    }
  }
  return fixes;
}

/** Svaki prolaz broji ćeliju jednom, koliko god fixova palo u nju. */
function passCells(fixes: readonly SkyFix[]): Set<string> {
  const cells = new Set<string>();
  for (let i = 1; i < fixes.length; i += 1) {
    const a = fixes[i - 1]!;
    const b = fixes[i]!;
    if (b.atMs - a.atMs > MAX_FIX_GAP_MS) continue;
    const dAlt = b.altitudeDeg - a.altitudeDeg;
    const dAz = ((b.azimuthDeg - a.azimuthDeg + 540) % 360) - 180;
    // Između dva fixa avion prijeđe i po nekoliko ćelija.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dAlt), Math.abs(dAz)) / (CELL_DEG / 2)));
    for (let k = 0; k <= steps; k += 1) {
      const f = k / steps;
      const [x, y] = skyCell(a.altitudeDeg + f * dAlt, (a.azimuthDeg + f * dAz + 360) % 360);
      cells.add(densityKey(x, y, hourBin(a.atMs + f * (b.atMs - a.atMs))));
    }
  }
  return cells;
}

export async function buildSkyDensity(
  sessionsByCallsign: ReadonlyMap<string, RoutePoint[][]>,
  observer: GroundObserver
): Promise<SkyDensity> {
  const density = new Map<string, number>();
  let callsignIndex = 0;
  for (const sessions of sessionsByCallsign.values()) {
    await yieldToEventLoop(callsignIndex);
    callsignIndex += 1;
    for (const session of sessions) {
      for (const key of passCells(skyFixes(session, observer))) {
        density.set(key, (density.get(key) ?? 0) + 1);
      }
    }
  }
  return density;
}

/** Prosjek 3×3 ćelije: pojedina ćelija je preuska za 30 dana podataka. */
function densityAround(density: SkyDensity, moon: MoonPosition, hour: number): number {
  const [x, y] = skyCell(moon.altitudeDeg, moon.azimuthDeg);
  let sum = 0;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      sum += density.get(densityKey(x + dx, y + dy, hour)) ?? 0;
    }
  }
  return sum / 9;
}

export type WatchRating = "best" | "good";

export type WatchWindow = {
  readonly startMs: number;
  readonly endMs: number;
  readonly rating: WatchRating;
  /** Očekivani broj prolaza preko diska u cijelom terminu. */
  readonly expectedTransits: number;
  readonly moonAltDeg: number;
  readonly moonAzDeg: number;
};

type Slot = {
  startMs: number;
  expectedTransits: number;
  moon: MoonPosition;
  rating: WatchRating | null;
};

export type WatchSlotsArgs = {
  readonly observer: GroundObserver;
  readonly nowMs: number;
  readonly toMs: number;
};

/** Polusati s Mjesecom iznad praga; rang je među svima njima, prazni uključeni. */
export function watchSlots(
  density: SkyDensity,
  { observer, nowMs, toMs }: WatchSlotsArgs
): Slot[] {
  const slots: Slot[] = [];
  for (let startMs = Math.floor(nowMs / SLOT_MS) * SLOT_MS; startMs < toMs; startMs += SLOT_MS) {
    const midMs = startMs + SLOT_MS / 2;
    const moon = getMoonPosition(
      new Date(midMs),
      observer.lat,
      observer.lng,
      observer.groundHeightMeters
    );
    if (moon.altitudeDeg < CAUTION_BELOW_DEG) continue;
    const passesPerDay = densityAround(density, moon, hourBin(midMs)) / WATCH_HISTORY_DAYS;
    slots.push({
      startMs,
      moon,
      rating: null,
      expectedTransits:
        passesPerDay * (SLOT_MS / (HOUR_BIN * HOUR_MS)) * (MOON_CROSSING_WIDTH_DEG / CELL_DEG),
    });
  }
  const ranked = [...slots].sort((a, b) => b.expectedTransits - a.expectedTransits);
  const bestCount = Math.ceil(ranked.length * BEST_SHARE);
  const goodCount = Math.ceil(ranked.length * GOOD_SHARE);
  ranked.slice(0, goodCount).forEach((slot, index) => {
    if (slot.expectedTransits > 0) slot.rating = index < bestCount ? "best" : "good";
  });
  return slots;
}

/** Spaja uzastopne dobre polusate u termine koje se isplati navesti. */
export function mergeWatchWindows(slots: readonly Slot[]): WatchWindow[] {
  const windows: WatchWindow[] = [];
  let open: Slot[] = [];
  const close = () => {
    if (open.length === 0) return;
    const peak = open.reduce((a, b) => (b.expectedTransits > a.expectedTransits ? b : a));
    windows.push({
      startMs: open[0]!.startMs,
      endMs: open[open.length - 1]!.startMs + SLOT_MS,
      rating: open.some((s) => s.rating === "best") ? "best" : "good",
      expectedTransits: Number(open.reduce((s, x) => s + x.expectedTransits, 0).toFixed(2)),
      moonAltDeg: Math.round(peak.moon.altitudeDeg),
      moonAzDeg: Math.round(peak.moon.azimuthDeg),
    });
    open = [];
  };
  for (const slot of slots) {
    const previous = open[open.length - 1];
    if (slot.rating === null || (previous && slot.startMs - previous.startMs > SLOT_MS)) close();
    if (slot.rating !== null) open.push(slot);
  }
  close();
  return windows;
}
