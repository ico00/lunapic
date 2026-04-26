import type { FlightState } from "./flight";
import type { MoonState } from "./moon";
import type { GroundObserver } from "./geo";

/**
 * A flight whose sky direction is near the moon disc at a given time.
 */
export interface TransitCandidate {
  readonly flight: FlightState;
  /** Center-to-center separation on the sky sphere, degrees. */
  readonly separationDeg: number;
  /**
   * True if separation is within the combined apparent radii
   * (moon + aircraft disc), using domain thresholds.
   */
  readonly isPossibleTransit: boolean;
}

/**
 * Input for transit screening: who is looking, when, and moon state.
 */
export interface TransitContext {
  readonly observer: GroundObserver;
  /** Unix epoch ms. */
  readonly atEpochMs: number;
  readonly moon: MoonState;
}
