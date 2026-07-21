import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isSnapshotFresh,
  readSdrSnapshot,
  SNAPSHOT_STALE_AFTER_MS,
  writeSdrSnapshot,
} from "./sdrSnapshotStore";

const SNAPSHOT_FILE = path.join(process.cwd(), "data", "sdr-snapshot.json");

function removeSnapshot(): void {
  try {
    fs.unlinkSync(SNAPSHOT_FILE);
  } catch {
    /* nije postojao */
  }
}

afterEach(removeSnapshot);

describe("sdrSnapshotStore", () => {
  it("zapisuje i čita snapshot neizmijenjen", () => {
    const body = JSON.stringify({ now: 1, aircraft: [{ hex: "4bcdb4" }] });
    writeSdrSnapshot(body);
    const read = readSdrSnapshot();
    expect(read?.body).toBe(body);
    expect(read?.receivedAt).toBeGreaterThan(0);
  });

  it("svjež snapshot je fresh, star nije", () => {
    writeSdrSnapshot('{"aircraft":[]}');
    const snap = readSdrSnapshot();
    expect(isSnapshotFresh(snap)).toBe(true);
    // Simuliraj protek vremena preko `nowMs` umjesto čekanja.
    expect(
      isSnapshotFresh(snap, Date.now() + SNAPSHOT_STALE_AFTER_MS + 1_000)
    ).toBe(false);
  });

  it("nedostajuća datoteka daje null (ne baca)", () => {
    removeSnapshot();
    expect(readSdrSnapshot()).toBeNull();
    expect(isSnapshotFresh(null)).toBe(false);
  });

  it("pokvaren sadržaj daje null umjesto pucanja", () => {
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, "{ ovo nije json", "utf8");
    expect(readSdrSnapshot()).toBeNull();
  });

  it("zapis bez očekivanih polja daje null", () => {
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({ foo: 1 }), "utf8");
    expect(readSdrSnapshot()).toBeNull();
  });

  it("upis ne ostavlja tmp datoteke (atomičan rename)", () => {
    writeSdrSnapshot('{"aircraft":[]}');
    const leftovers = fs
      .readdirSync(path.dirname(SNAPSHOT_FILE))
      .filter((f) => f.startsWith("sdr-snapshot.json.") && f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});
