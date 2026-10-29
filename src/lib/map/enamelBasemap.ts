import type { Map as MapboxMap } from "mapbox-gl";

/**
 * Prebojava Mapboxov `dark-v11` u neutralni grafit (spec §2b.2) na učitavanju
 * stila: kopno, voda, ceste, granice i oznake. Karta je namjerno siva, ne plava,
 * da se jasno odvaja od plavog sučelja i da boje linija (amber, scarlet,
 * cobalt) na njoj nose značenje. Slojeve prepoznaje po tipu i
 * imenu, pa ne ovisi o točnom popisu id-eva u stilu. Svaki sloj ima vlastiti
 * try/catch jer neki id-evi nemaju paint svojstvo koje pokušavamo postaviti.
 */
const C = {
  land: "#1b1d21",
  landSoft: "#1f2126",
  water: "#0d0e11",
  waterLine: "#2a2d34",
  road: "#2c2f36",
  roadMajor: "#3d414a",
  boundary: "#4b505b",
  label: "#8e939d",
  labelMajor: "#c4c8cf",
  halo: "#111215",
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
      // `admin-*-boundary-bg` je široka zamućena podloga ispod granice; s našom
      // bojom postaje siva traka uz liniju koja pri zumu mijenja debljinu.
      if (/boundary-bg$/.test(id)) map.setLayoutProperty(id, "visibility", "none");
      else if (/admin|boundary/.test(id)) set(map, id, "line-color", C.boundary);
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
