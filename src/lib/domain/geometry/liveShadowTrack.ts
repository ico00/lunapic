import { createMoonStateCache } from "@/lib/domain/astro/moonStateCache";
import type { FlightState } from "@/types/flight";
import { DEFAULT_WINGSPAN_M } from "./shotFeasibility";
import { solveMoonShadowSpot, type MoonShadowSpot } from "./moonShadowSpot";
import { destinationByAzimuthMeters } from "./wgs84";

/**
 * Live "stand here" centerline for one airborne aircraft.
 *
 * The shadow spot travels at the aircraft's own ground speed — roughly 15 km
 * per minute for a jet — so this is not a place to drive to. It answers the
 * question the photographer actually has while a flight is inbound: *am I on
 * the line, and if not, which way and how far off?*
 *
 * The horizon deliberately matches `MAX_ALIGNMENT_LOOKAHEAD_SEC` (300 s) from
 * `lineOfSightKinematics`: past five minutes, dead reckoning on a constant
 * track and speed stops being trustworthy, and a confident line drawn from it
 * would be a lie rather than a forecast.
 */

export const LIVE_SHADOW_HORIZON_SEC = 300;
const STEP_SEC = 15;
const FPM_TO_MPS = 0.00508;

export interface LiveShadowSample {
  /** Seconds from now; 0 is the aircraft's current position. */
  readonly offsetSec: number;
  readonly spot: MoonShadowSpot;
}

export interface LiveShadowTrack {
  readonly flightId: string;
  /** Chronological, may be shorter than the horizon where the solve fails. */
  readonly samples: readonly LiveShadowSample[];
  /** The `offsetSec === 0` sample, when it solved. */
  readonly now: LiveShadowSample | null;
}

/**
 * Dead-reckon the aircraft forward and solve the ground spot at each step.
 * Returns `null` when the flight lacks the state to project (no altitude, no
 * speed/track) or when the Moon is too low for any spot to exist.
 */
export function buildLiveShadowTrack(args: {
  readonly flight: FlightState;
  readonly nowMs: number;
  readonly groundHeightMeters: number;
  readonly horizonSec?: number;
  readonly stepSec?: number;
}): LiveShadowTrack | null {
  const { flight, nowMs, groundHeightMeters } = args;
  const horizonSec = args.horizonSec ?? LIVE_SHADOW_HORIZON_SEC;
  const stepSec = args.stepSec ?? STEP_SEC;

  const altitude = flight.geoAltitudeMeters ?? flight.baroAltitudeMeters;
  if (altitude == null) {
    return null;
  }
  const speedMps = flight.groundSpeedMps;
  const trackDeg = flight.trackDeg;
  const canProject =
    speedMps != null &&
    trackDeg != null &&
    Number.isFinite(speedMps) &&
    Number.isFinite(trackDeg) &&
    speedMps >= 1;

  // Vertical rate matters here in a way it does not for a map trail: a
  // descending aircraft's spot walks toward the observer as its height drops.
  const verticalMps = (flight.verticalRateFpm ?? 0) * FPM_TO_MPS;
  const wingspanMeters = flight.wingspanMeters ?? DEFAULT_WINGSPAN_M;
  const moonAt = createMoonStateCache();

  const samples: LiveShadowSample[] = [];
  for (let offsetSec = 0; offsetSec <= horizonSec; offsetSec += stepSec) {
    const projected = canProject
      ? destinationByAzimuthMeters(
          flight.position.lat,
          flight.position.lng,
          ((trackDeg! % 360) + 360) % 360,
          speedMps! * offsetSec
        )
      : { lat: flight.position.lat, lng: flight.position.lng };
    const spot = solveMoonShadowSpot({
      aircraftLat: projected.lat,
      aircraftLng: projected.lng,
      aircraftAltitudeMeters: altitude + verticalMps * offsetSec,
      atMs: nowMs + offsetSec * 1000,
      groundHeightMeters,
      wingspanMeters,
      moonAt,
    });
    if (spot) {
      samples.push({ offsetSec, spot });
    }
    if (!canProject) {
      break; // no trajectory to walk — a single point is all we can honestly draw
    }
  }

  if (samples.length === 0) {
    return null;
  }
  return {
    flightId: flight.id,
    samples,
    now: samples[0]?.offsetSec === 0 ? samples[0] : null,
  };
}
