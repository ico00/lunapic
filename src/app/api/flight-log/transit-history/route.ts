import { NextRequest, NextResponse } from "next/server";
import { getPositionsInBounds } from "@/lib/db/flightLogDb";
import { getMoonState } from "@/lib/domain/astro/moon";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { horizontalToPoint } from "@/lib/domain/geometry/horizontal";
import { angularSeparationDeg } from "@/lib/domain/geometry/sky-separation";
import { aircraftAngularSizeDeg } from "@/lib/domain/geometry/shotFeasibility";
import { geodeticToEcef } from "@/lib/domain/geometry/wgs84";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import type { MoonState } from "@/types/moon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE = { "Cache-Control": "no-store" };

/**
 * Retroactive transit scan: replay logged ADS-B positions against the Moon's
 * historical position for the given observer, and report moments when an
 * aircraft actually crossed (or nearly crossed) the lunar disc.
 *
 * Unlike the live pipeline this needs no prediction — the positions are facts.
 * Classification:
 *   - "transit": separation ≤ moon apparent radius + aircraft angular radius
 *   - "near":    separation ≤ NEAR_TOL_DEG (matches live active-transit tolerance)
 */

const NEAR_TOL_DEG = 0.5;
const MAX_SLANT_M = 100_000;
const DEFAULT_WINGSPAN_M = 40;
/** Consecutive hits of one aircraft within this window merge into one event. */
const EVENT_GAP_MS = 5 * 60_000;
/** Moon ephemeris is sampled per minute — plenty for a 15 s ADS-B cadence. */
const MOON_BUCKET_MS = 60_000;

export interface TransitHistoryEvent {
  icao24: string;
  callsign: string | null;
  /** Time of closest approach, epoch ms. */
  timeMs: number;
  /** Minimum angular separation from moon centre, degrees. */
  minSeparationDeg: number;
  kind: "transit" | "near";
  moonAltDeg: number;
  slantKm: number;
}

interface OpenEvent extends TransitHistoryEvent {
  lastHitMs: number;
}

export async function GET(req: NextRequest) {
  const reject = rejectIfRateLimited(req, 6, 60_000);
  if (reject) return reject;

  const sp = req.nextUrl.searchParams;
  const days = Math.min(Math.max(parseFloat(sp.get("days") ?? "7"), 0.5), 30);
  const lat = parseFloat(sp.get("lat") ?? "");
  const lng = parseFloat(sp.get("lng") ?? "");
  const heightM = parseFloat(sp.get("heightM") ?? "0");
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Invalid observer" }, { status: 400, headers: NO_CACHE });
  }
  const observer = {
    lat,
    lng,
    groundHeightMeters: isFinite(heightM) ? heightM : 0,
  };

  const toMs = Date.now();
  const fromMs = toMs - days * 86_400_000;

  // Bounding box generously covering MAX_SLANT_M ground distance
  const dLat = 0.95;
  const dLng = 0.95 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));

  let rows;
  try {
    rows = await getPositionsInBounds(fromMs, toMs, lat - dLat, lat + dLat, lng - dLng, lng + dLng);
  } catch (e) {
    console.error("[flight-log/transit-history]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_CACHE });
  }

  // Lazy per-minute moon ephemeris — only minutes that actually have positions
  // get an astronomy-engine call; null marks "moon below usable altitude".
  const moonByMinute = new Map<number, MoonState | null>();
  const moonAt = (ms: number): MoonState | null => {
    const bucket = Math.round(ms / MOON_BUCKET_MS) * MOON_BUCKET_MS;
    if (moonByMinute.has(bucket)) return moonByMinute.get(bucket)!;
    const m = getMoonState(new Date(bucket), lat, lng, observer.groundHeightMeters);
    const usable = m.altitudeDeg >= CRITICAL_BELOW_DEG ? m : null;
    moonByMinute.set(bucket, usable);
    return usable;
  };

  const pObs = geodeticToEcef(lat, lng, observer.groundHeightMeters);
  const openEvents = new Map<string, OpenEvent>();
  const events: TransitHistoryEvent[] = [];

  const closeEvent = (ev: OpenEvent) => {
    events.push({
      icao24: ev.icao24,
      callsign: ev.callsign,
      timeMs: ev.timeMs,
      minSeparationDeg: ev.minSeparationDeg,
      kind: ev.kind,
      moonAltDeg: ev.moonAltDeg,
      slantKm: ev.slantKm,
    });
  };

  for (const row of rows) {
    const moon = moonAt(row.logged_at);
    if (!moon) continue;

    const pAc = geodeticToEcef(row.lat, row.lng, row.alt_m);
    const slantM = Math.hypot(pAc.x - pObs.x, pAc.y - pObs.y, pAc.z - pObs.z);
    if (slantM > MAX_SLANT_M) continue;

    const ac = horizontalToPoint(observer, row.lat, row.lng, row.alt_m);
    const sep = angularSeparationDeg(
      { altitudeDeg: ac.altitudeDeg, azimuthDeg: ac.azimuthDeg },
      { altitudeDeg: moon.altitudeDeg, azimuthDeg: moon.azimuthDeg }
    );
    if (sep > NEAR_TOL_DEG) continue;

    const acRadiusDeg = aircraftAngularSizeDeg(DEFAULT_WINGSPAN_M, slantM) / 2;
    const kind: "transit" | "near" =
      sep <= moon.apparentRadius.degrees + acRadiusDeg ? "transit" : "near";

    const open = openEvents.get(row.icao24);
    if (open && row.logged_at - open.lastHitMs <= EVENT_GAP_MS) {
      open.lastHitMs = row.logged_at;
      if (sep < open.minSeparationDeg) {
        open.minSeparationDeg = sep;
        open.timeMs = row.logged_at;
        open.moonAltDeg = moon.altitudeDeg;
        open.slantKm = slantM / 1000;
        open.callsign = row.callsign ?? open.callsign;
      }
      if (kind === "transit") open.kind = "transit";
    } else {
      if (open) closeEvent(open);
      openEvents.set(row.icao24, {
        icao24: row.icao24,
        callsign: row.callsign,
        timeMs: row.logged_at,
        minSeparationDeg: sep,
        kind,
        moonAltDeg: moon.altitudeDeg,
        slantKm: slantM / 1000,
        lastHitMs: row.logged_at,
      });
    }
  }
  for (const ev of openEvents.values()) closeEvent(ev);

  events.sort((a, b) => b.timeMs - a.timeMs);

  return NextResponse.json(
    {
      events: events.map((e) => ({
        ...e,
        minSeparationDeg: Number(e.minSeparationDeg.toFixed(3)),
        moonAltDeg: Number(e.moonAltDeg.toFixed(1)),
        slantKm: Number(e.slantKm.toFixed(1)),
      })),
      scannedPositions: rows.length,
      days,
    },
    { headers: NO_CACHE }
  );
}
