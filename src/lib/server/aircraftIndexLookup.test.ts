import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const { lookupAircraft } = createRequire(import.meta.url)("../../../aircraftIndexLookup.cjs");

describe("lookupAircraft", () => {
  it("čita tip, registraciju i opis iz stvarnog indeksa", () => {
    const dir = path.join(process.cwd(), "public/data/opensky-aircraft");
    const shard = JSON.parse(readFileSync(path.join(dir, readdirSync(dir)[0]), "utf8"));
    const [icao, row] = Object.entries(shard).find(
      ([, r]) => (r as string[]).length === 4 && !/unknown/i.test((r as string[])[3])
    ) as [string, string[]];
    const hit = lookupAircraft(icao);
    expect(hit.t).toBe(row[0].trim());
    expect(hit.r).toBe(row[3].trim());
    expect(hit.desc).toContain(row[1].trim());
  });

  it("vraća null za nepoznat avion ili neispravan hex, bez bacanja", () => {
    expect(lookupAircraft("ffffff")).toBeNull();
    expect(lookupAircraft("~4bcd")).toBeNull();
  });
});
