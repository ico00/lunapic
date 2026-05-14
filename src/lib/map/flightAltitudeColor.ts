import type { Map } from "mapbox-gl";

import { FLIGHTS_LAYER_ID } from "@/lib/map/mapSourceIds";

const ATC_FLIGHTS_DOT_LAYER_ID = "atc-flights-dot-layer";

/**
 * Boja zrakoplova na karti prema **baro/geo visini** (GeoJSON `altitudeMeters`, m).
 * **Shot-feasible** (`isShotFeasible`) uvijek **mint** (`#34d399`, token `--mint` u `globals.css`).
 *
 * Skala po ft bandovima (nisko → visoko): crvena → narančasta → zlatna → zelena → plava → ljubičasta,
 * usklađena s {@link ALTITUDE_BANDS} i {@link FLIGHT_ALTITUDE_LEGEND_STOPS}.
 */
const ALTITUDE_GET: unknown[] = [
  "coalesce",
  ["to-number", ["get", "altitudeMeters"]],
  0,
];

// Granice u metrima: 5k ft=1524m, 15k ft=4572m, 25k ft=7620m, 35k ft=10668m, 45k ft=13716m
/** Mapbox `case` / `interpolate` izraz za `model-color` i `circle-color`. */
export function flightFeatureColorMapboxExpression(): unknown[] {
  return [
    "case",
    ["boolean", ["get", "isShotFeasible"], false],
    "#34d399",
    [
      "interpolate",
      ["linear"],
      ALTITUDE_GET,
      0,
      "#FF4D4D",
      1524,
      "#FFA500",
      4572,
      "#FFD700",
      7620,
      "#4CAF50",
      10668,
      "#2196F3",
      13716,
      "#9C27B0",
    ],
  ];
}

/** Jedna neutralna boja za sve ne-„shot-feasible" zrakoplove (bez skale po visini). */
export function flightFeatureFlatColorMapboxExpression(): unknown[] {
  return [
    "case",
    ["boolean", ["get", "isShotFeasible"], false],
    "#34d399",
    "#8b90a8",
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
  const ex = flightFeatureColorMapboxExpressionForAltitudeTint(
    useAltitudeTint
  ) as never;
  try {
    const layer = map.getLayer(FLIGHTS_LAYER_ID) as
      | { type?: string }
      | undefined;
    if (layer?.type === "circle") {
      map.setPaintProperty(FLIGHTS_LAYER_ID, "circle-color", ex);
    } else if (layer?.type === "model") {
      map.setPaintProperty(FLIGHTS_LAYER_ID, "model-color", ex);
    }
    const atcDotLayer = map.getLayer(ATC_FLIGHTS_DOT_LAYER_ID) as
      | { type?: string }
      | undefined;
    if (atcDotLayer?.type === "circle") {
      map.setPaintProperty(ATC_FLIGHTS_DOT_LAYER_ID, "circle-stroke-color", ex);
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

/** Jedinica za brojčane oznake ispod trake altitude legende (MSL u podacima i dalje u metrima). */
export type FlightAltitudeLegendUnit = "km" | "ft";

export type AltitudeBand = {
  /** Kratki label za slider (ft). */
  readonly ftLabel: string;
  /** Kategorija npr. "Approach / Takeoff". */
  readonly category: string;
  readonly minMeters: number;
  readonly maxMeters: number;
  readonly color: string;
};

/**
 * 6 altitude bandova (indeks 1-6); indeks 0 rezerviran za "All" u UI-u.
 * minMeters/maxMeters su granice [min, max) s Infinity za zadnji band.
 */
export const ALTITUDE_BANDS: readonly AltitudeBand[] = [
  { ftLabel: "0–5k ft",   category: "Approach / Takeoff",    minMeters: 0,     maxMeters: 1524,     color: "#FF4D4D" },
  { ftLabel: "5–15k ft",  category: "Terminal / Climb",      minMeters: 1524,  maxMeters: 4572,     color: "#FFA500" },
  { ftLabel: "15–25k ft", category: "Transitional",          minMeters: 4572,  maxMeters: 7620,     color: "#FFD700" },
  { ftLabel: "25–35k ft", category: "Cruise (Lower)",        minMeters: 7620,  maxMeters: 10668,    color: "#4CAF50" },
  { ftLabel: "35–45k ft", category: "Cruise (Upper)",        minMeters: 10668, maxMeters: 13716,    color: "#2196F3" },
  { ftLabel: "45k+ ft",   category: "High / BizJet",         minMeters: 13716, maxMeters: Infinity, color: "#9C27B0" },
] as const;

const METERS_TO_FEET = 3.280839895013123;

function formatLegendThousandsK(valueK: number, suffixPlus: boolean): string {
  const rounded = Math.round(valueK * 10) / 10;
  let base: string;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    base = String(Math.round(rounded));
  } else {
    base = rounded.toFixed(1).replace(/\.0$/, "");
  }
  return `${base}k${suffixPlus ? "+" : ""}`;
}

/** Tekst ispod legende za jedan rubni stop (km = ugrađeni kratki labeli, ft = kompaktno u tisućama ft). */
export function flightAltitudeLegendStopLabel(
  stop: FlightAltitudeLegendStop,
  unit: FlightAltitudeLegendUnit,
  isLastStop: boolean
): string {
  if (unit === "km") {
    return stop.label;
  }
  if (stop.altMeters === 0) {
    return "0";
  }
  const ft = stop.altMeters * METERS_TO_FEET;
  return formatLegendThousandsK(ft / 1000, isLastStop);
}

/**
 * Rubni labeli za legendu — kratki oblik (`k` = km MSL) da stanu u jedan redak uz čitljiv font.
 */
export const FLIGHT_ALTITUDE_LEGEND_STOPS: readonly FlightAltitudeLegendStop[] =
  [
    { altMeters: 0,     color: "#FF4D4D", label: "0m" },
    { altMeters: 1524,  color: "#FFA500", label: "1.5k" },
    { altMeters: 4572,  color: "#FFD700", label: "4.6k" },
    { altMeters: 7620,  color: "#4CAF50", label: "7.6k" },
    { altMeters: 10668, color: "#2196F3", label: "10.7k" },
    { altMeters: 13716, color: "#9C27B0", label: "13.7k+" },
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
