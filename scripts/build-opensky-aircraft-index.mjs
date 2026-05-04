/**
 * Preuzima OpenSky Aircraft Metadata Database (ZIP), parsira CSV i gradi
 * shardirane JSON datoteke pod `public/data/opensky-aircraft/{prefix}.json`.
 *
 * Izvor: https://opensky-network.org/datasets/metadata/aircraftDatabase.zip
 * (redirect na S3). Baza je „as is”; vidi https://opensky-network.org/data/aircraft
 *
 * Pokretanje: `npm run data:opensky-aircraft`
 */
import { mkdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { parse } from "csv-parse";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "data", "opensky-aircraft");
const ZIP_URL =
  "https://opensky-network.org/datasets/metadata/aircraftDatabase.zip";
const CSV_ENTRY = "media/data/samples/metadata/aircraftDatabase.csv";

const HEX_ICAO24 = /^[0-9a-f]{6}$/;

function primaryTypeCode(record) {
  const t = String(record.typecode ?? "").trim();
  if (t) {
    return t;
  }
  const icaot = String(record.icaoaircrafttype ?? "").trim();
  if (icaot) {
    return icaot;
  }
  return "";
}

function normalizeIcao24(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!HEX_ICAO24.test(s)) {
    return null;
  }
  return s;
}

function shardPrefix(icao24) {
  return icao24.slice(0, 3);
}

async function main() {
  console.info(`[opensky-aircraft-index] GET ${ZIP_URL}`);
  const zipRes = await fetch(ZIP_URL);
  if (!zipRes.ok) {
    throw new Error(`Download failed: ${zipRes.status} ${zipRes.statusText}`);
  }
  const zipBuf = Buffer.from(await zipRes.arrayBuffer());
  console.info(
    `[opensky-aircraft-index] ZIP ${(zipBuf.length / (1024 * 1024)).toFixed(2)} MiB`
  );

  const zip = new AdmZip(zipBuf);
  const entry = zip.getEntry(CSV_ENTRY);
  if (!entry) {
    throw new Error(`Missing ZIP entry: ${CSV_ENTRY}`);
  }
  const csvBuffer = entry.getData();
  console.info(
    `[opensky-aircraft-index] CSV ${(csvBuffer.length / (1024 * 1024)).toFixed(2)} MiB`
  );

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  /** @type {Map<string, Record<string, readonly [string, string, string]>>} */
  const buckets = new Map();

  let rows = 0;
  let kept = 0;

  const pt = new PassThrough();
  pt.end(csvBuffer);
  const parser = pt.pipe(
    parse({
      columns: true,
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
    })
  );

  for await (const record of parser) {
    rows += 1;
    if (rows % 50_000 === 0) {
      console.info(`[opensky-aircraft-index] … ${rows} CSV rows, ${kept} index entries`);
    }
    const icao24 = normalizeIcao24(record.icao24);
    if (!icao24) {
      continue;
    }
    const typecode = primaryTypeCode(record);
    const model = String(record.model ?? "").trim();
    const manufacturer = String(record.manufacturername ?? "").trim();
    if (!typecode && !model && !manufacturer) {
      continue;
    }
    const prefix = shardPrefix(icao24);
    let shard = buckets.get(prefix);
    if (!shard) {
      shard = Object.create(null);
      buckets.set(prefix, shard);
    }
    if (shard[icao24] != null) {
      continue;
    }
    shard[icao24] = /** @type {const} */ ([typecode, model, manufacturer]);
    kept += 1;
  }

  const manifest = { builtAt: new Date().toISOString(), source: ZIP_URL, shards: [] };

  for (const [prefix, data] of [...buckets.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const body = JSON.stringify(data);
    await writeFile(path.join(OUT_DIR, `${prefix}.json`), body, "utf8");
    manifest.shards.push({
      prefix,
      aircraft: Object.keys(data).length,
      bytes: Buffer.byteLength(body, "utf8"),
    });
  }

  await writeFile(
    path.join(OUT_DIR, "manifest.json"),
    `${JSON.stringify(
      {
        ...manifest,
        csvRows: rows,
        indexEntries: kept,
        shardCount: manifest.shards.length,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.info(
    `[opensky-aircraft-index] done: ${kept} entries in ${manifest.shards.length} shards (${rows} CSV rows)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
