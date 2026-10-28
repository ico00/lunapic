import type { RunwayShadowLine } from "@/lib/domain/geometry/runwayShadowPlan";
import type { Feature, FeatureCollection } from "geojson";

/**
 * Map geometry for the LDZA runway planner: one ground line per planned
 * instant and flow, with a coverage marker where the aircraft is 4/6/8/10/12 km
 * out and a clock label at the line's near end.
 *
 * `active` is the only styling input the layer needs besides `flow`: when one
 * instant is focused in the panel, every other line is dimmed instead of hidden
 * so the pattern across the whole window stays readable.
 */

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** HH:MM in the viewer's timezone, same format as the rest of the shell. */
export function formatPlanTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function buildRunwayShadowPlanFeatures(
  lines: readonly RunwayShadowLine[],
  focusMs: number | null
): FeatureCollection {
  if (lines.length === 0) {
    return EMPTY;
  }

  const features: Feature[] = [];
  for (const line of lines) {
    const active = focusMs === null || focusMs === line.atMs;
    const label = formatPlanTime(line.atMs);
    const base = { flow: line.flow, timeMs: line.atMs, active };

    if (line.points.length >= 2) {
      features.push({
        type: "Feature",
        properties: { ...base, kind: "line", label },
        geometry: {
          type: "LineString",
          coordinates: line.points.map((p) => [p.lng, p.lat]),
        },
      });
    }

    const near = line.points[0]!;
    features.push({
      type: "Feature",
      properties: { ...base, kind: "time", label },
      geometry: { type: "Point", coordinates: [near.lng, near.lat] },
    });

    for (const p of line.points) {
      if (!p.isMarker) {
        continue;
      }
      features.push({
        type: "Feature",
        properties: {
          ...base,
          kind: "marker",
          label: `${(p.coveragePercent / 100).toFixed(1)}×`,
          distanceKm: p.distanceKm,
        },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      });
    }
  }

  return { type: "FeatureCollection", features };
}
