"use strict";

/**
 * Tip, registracija i opis aviona iz OpenSky indeksa (`public/data/opensky-aircraft`)
 * za `server.js`. Pi vrti `readsb` bez baze tipova (feed nema `t`/`r`), a u push
 * načinu nema ni tar1090 baze, pa bi `localsdr` zapisi u logu inače ostali bez tipa.
 * Isti indeks koji klijent čita preko `openskyAircraftIndexClient.ts`, ovdje iz
 * datoteke, jer poller ne smije ovisiti o vlastitom HTTP-u.
 *
 * Plain `.cjs` iz istog razloga kao `sdrSnapshot.cjs`.
 */

const fs = require("node:fs");
const path = require("node:path");

const INDEX_DIR = path.join(process.cwd(), "public", "data", "opensky-aircraft");

/** Shard je ~30 KB, a promet dolazi iz malo prefiksa; strop čuva memoriju procesa. */
const MAX_CACHED_SHARDS = 128;
const shards = new Map();

function loadShard(prefix) {
  const cached = shards.get(prefix);
  if (cached) return cached;
  let shard = {};
  try {
    shard = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, `${prefix}.json`), "utf8"));
  } catch {
    // Nema sharda za taj prefiks: uobičajeno, a poller ne smije stati zbog metapodataka.
  }
  if (shards.size >= MAX_CACHED_SHARDS) shards.delete(shards.keys().next().value);
  shards.set(prefix, shard);
  return shard;
}

function text(value) {
  const t = typeof value === "string" ? value.trim() : "";
  return t && !/unknown/i.test(t) ? t : null;
}

/** Isti redoslijed kao `formatOpenSkyAircraftIndexLabel`: proizvođač + model. */
function description(model, manufacturer) {
  if (model && manufacturer) {
    return model.toLowerCase().startsWith(manufacturer.toLowerCase())
      ? model
      : `${manufacturer} ${model}`;
  }
  return model ?? manufacturer;
}

/**
 * @param {string} icao24
 * @returns {{ r: string|null, t: string|null, desc: string|null }|null}
 */
function lookupAircraft(icao24) {
  const id = String(icao24).toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(id)) return null;
  const row = loadShard(id.slice(0, 3))[id];
  if (!Array.isArray(row)) return null;
  const [typecode, model, manufacturer, registration] = row;
  return {
    r: text(registration),
    t: text(typecode),
    desc: description(text(model), text(manufacturer)),
  };
}

module.exports = { lookupAircraft };
