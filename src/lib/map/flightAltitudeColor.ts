import type { Map } from "mapbox-gl";

import { FLIGHTS_LAYER_ID } from "@/lib/map/mapSourceIds";

/**
 * Boja zrakoplova na karti prema **baro/geo visini** (GeoJSON `altitudeMeters`, m).
 * **Shot-feasible** (`isShotFeasible`) uvijek **#22c55e** (prioritet u `case` grani).
 *
 * Skala nisko → visoko: **svijetlo zelena** → **zelena** → **plava** → **tamno plava**
 * (~12 km MSL), usklađena s {@link FLIGHT_ALTITUDE_LEGEND_STOPS}.
 */
const ALTITUDE_GET: unknown[] = [
  "coalesce",
  ["to-number", ["get", "altitudeMeters"]],
  0,
];

/** Mapbox `case` / `interpolate` izraz za `model-color` i `circle-color`. */
export function flightFeatureColorMapboxExpression(): unknown[] {
  return [
    "case",
    ["boolean", ["get", "isShotFeasible"], false],
    "#22c55e",
    [
      "interpolate",
      ["linear"],
      ALTITUDE_GET,
      0,
      "#86efac",
      2000,
      "#4ade80",
      4500,
      "#22c55e",
      7000,
      "#3b82f6",
      9500,
      "#1d4ed8",
      12000,
      "#172554",
    ],
  ];
}

/** Jedna neutralna boja za sve ne-„shot-feasible” zrakoplove (bez skale po visini). */
export function flightFeatureFlatColorMapboxExpression(): unknown[] {
  return [
    "case",
    ["boolean", ["get", "isShotFeasible"], false],
    "#22c55e",
    "#94a3b8",
  ];
}

export function flightFeatureColorMapboxExpressionForAltitudeTint(
  useAltitudeTint: boolean
): unknown[] {
  return useAltitudeTint
    ? flightFeatureColorMapboxExpression()
    : flightFeatureFlatColorMapboxExpression();
}

/** Postavlja `circle-color` ili `model-color` na sloju letova (nakon učitavanja / promjene moda). */
export function applyFlightLayerColorPaint(
  map: Map,
  useAltitudeTint: boolean
): void {
  if (!map.isStyleLoaded()) {
    return;
  }
  const layer = map.getLayer(FLIGHTS_LAYER_ID) as { type?: string } | undefined;
  if (!layer) {
    return;
  }
  const ex = flightFeatureColorMapboxExpressionForAltitudeTint(
    useAltitudeTint
  ) as never;
  try {
    if (layer.type === "circle") {
      map.setPaintProperty(FLIGHTS_LAYER_ID, "circle-color", ex);
    } else if (layer.type === "model") {
      map.setPaintProperty(FLIGHTS_LAYER_ID, "model-color", ex);
    }
  } catch {
    /* stil / sloj u tranziciji */
  }
}

export type FlightAltitudeLegendStop = {
  readonly altMeters: number;
  readonly color: string;
  readonly label: string;
};

/**
 * Rubni labeli za legendu — kratki oblik (`k` = km MSL) da stanu u jedan redak uz čitljiv font.
 */
export const FLIGHT_ALTITUDE_LEGEND_STOPS: readonly FlightAltitudeLegendStop[] =
  [
    { altMeters: 0, color: "#86efac", label: "0m" },
    { altMeters: 2000, color: "#4ade80", label: "2k" },
    { altMeters: 4500, color: "#22c55e", label: "4.5k" },
    { altMeters: 7000, color: "#3b82f6", label: "7k" },
    { altMeters: 9500, color: "#1d4ed8", label: "9.5k" },
    { altMeters: 12000, color: "#172554", label: "12k+" },
  ] as const;

/** CSS `linear-gradient` za traku u legendi (isti rubovi kao interpolate). */
export function flightAltitudeLegendGradientCss(): string {
  const s = FLIGHT_ALTITUDE_LEGEND_STOPS;
  const last = s.length - 1;
  const parts = s.map((x, i) => {
    const p = last === 0 ? 0 : (i / last) * 100;
    return `${x.color} ${p.toFixed(1)}%`;
  });
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}
