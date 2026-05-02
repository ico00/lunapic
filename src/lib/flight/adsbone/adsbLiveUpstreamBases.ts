/**
 * ADSBExchange v2-compatible `/v2/point/{lat}/{lon}/{radius}` bases.
 * `api.adsb.one` is often behind strict Cloudflare; `api.airplanes.live` is used
 * as a fallback (same JSON shape in practice).
 */
export const ADSB_LIVE_POINT_BASES: readonly string[] = [
  "https://api.adsb.one/v2/point",
  "https://api.airplanes.live/v2/point",
];
