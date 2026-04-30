/**
 * Field-oriented moon elevation hints for photographers (mathematical horizon
 * vs practical visibility). Uses apparent altitude in degrees.
 */
export type MoonFieldVisibilityTier = "critical" | "caution" | "optimal";

export type MoonFieldVisibilityAdvice = {
  readonly tier: MoonFieldVisibilityTier;
  /** Short status for badges / headings (English UI). */
  readonly label: string;
  /** One-line explanation for the user. */
  readonly message: string;
};

const CRITICAL_BELOW_DEG = 5;
const CAUTION_BELOW_DEG = 12;

export function moonFieldVisibilityAdvice(
  altitudeDeg: number
): MoonFieldVisibilityAdvice {
  if (altitudeDeg < CRITICAL_BELOW_DEG) {
    return {
      tier: "critical",
      label: "Critical / Hidden",
      message: "Too low, likely blocked by horizon.",
    };
  }
  if (altitudeDeg < CAUTION_BELOW_DEG) {
    return {
      tier: "caution",
      label: "Caution / Low",
      message: "Low altitude, atmospheric haze possible.",
    };
  }
  return {
    tier: "optimal",
    label: "Optimal",
    message: "Good elevation for planning transits.",
  };
}
