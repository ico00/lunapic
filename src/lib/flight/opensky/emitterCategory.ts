/**
 * OpenSky state vector index 17 — `category` (s `extended=1` na `/states/all`).
 * @see https://openskynetwork.github.io/opensky-api/rest.html
 */
export function adsbEmitterCategoryLabel(
  code: number | null | undefined
): string | null {
  if (code == null || !Number.isFinite(code)) {
    return null;
  }
  const c = Math.round(code);
  const table: Record<number, string> = {
    0: "No information",
    1: "No ADS-B emitter category",
    2: "Light (< 15 500 lb)",
    3: "Small (15 500–75 000 lb)",
    4: "Large (75 000–300 000 lb)",
    5: "High vortex large (e.g. B757)",
    6: "Heavy (> 300 000 lb)",
    7: "High performance (>5 g, 400+ kt)",
    8: "Rotorcraft",
    9: "Glider / sailplane",
    10: "Lighter-than-air",
    11: "Parachutist / skydiver",
    12: "Ultralight / hang-glider / paraglider",
    13: "Reserved",
    14: "Unmanned aerial vehicle",
    15: "Space / trans-atmospheric",
    16: "Surface vehicle — emergency",
    17: "Surface vehicle — service",
    18: "Point obstacle",
    19: "Cluster obstacle",
    20: "Line obstacle",
  };
  return table[c] ?? `Aircraft category ${c}`;
}
