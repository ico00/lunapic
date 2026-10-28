import type { Map as MapboxMap } from "mapbox-gl";

/**
 * Prebojava Mapboxov `dark-v11` u emajl-plavu paletu (spec §2b.2) na učitavanju
 * stila: kopno, voda, ceste, granice i oznake. Slojeve prepoznaje po tipu i
 * imenu, pa ne ovisi o točnom popisu id-eva u stilu. Svaki sloj ima vlastiti
 * try/catch jer neki id-evi nemaju paint svojstvo koje pokušavamo postaviti.
 */
const C = {
  land: "#0f1c3d",
  landSoft: "#12224a",
  water: "#070e22",
  waterLine: "#1d3268",
  road: "#1d3268",
  roadMajor: "#2a3f73",
  boundary: "#2c3f6e",
  label: "#8a9abd",
  labelMajor: "#b8c4dc",
  halo: "#0b1530",
} as const;

function set(map: MapboxMap, id: string, prop: string, value: string | number) {
  try {
    // Svojstvo ovisi o tipu sloja, a tip se ovdje bira po imenu, pa tipizirani overload ne pomaže.
    (map.setPaintProperty as (id: string, prop: string, value: unknown) => void)(id, prop, value);
  } catch {
    /* sloj nema to svojstvo */
  }
}

export function applyEnamelBasemap(map: MapboxMap): void {
  const layers = map.getStyle()?.layers;
  if (!layers) return;
  for (const layer of layers) {
    const { id, type } = layer;
    if (type === "background") {
      set(map, id, "background-color", C.land);
    } else if (type === "fill") {
      if (/water/.test(id)) set(map, id, "fill-color", C.water);
      else if (/building/.test(id)) set(map, id, "fill-color", C.landSoft);
      else set(map, id, "fill-color", C.landSoft);
    } else if (type === "line") {
      if (/admin|boundary/.test(id)) set(map, id, "line-color", C.boundary);
      else if (/water/.test(id)) set(map, id, "line-color", C.waterLine);
      else if (/motorway|trunk|primary|major/.test(id)) set(map, id, "line-color", C.roadMajor);
      else if (/road|bridge|tunnel|street|path|ferry|aeroway/.test(id)) set(map, id, "line-color", C.road);
    } else if (type === "symbol") {
      const layout = (layer as { layout?: Record<string, unknown> }).layout;
      if (!layout || layout["text-field"] === undefined) continue;
      const major = /country|state|city|settlement-major|continent/.test(id);
      set(map, id, "text-color", major ? C.labelMajor : C.label);
      set(map, id, "text-halo-color", C.halo);
    }
  }
}
