import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ")
      ? auth.slice(7)
      : (new URL(req.url).searchParams.get("secret") ?? "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Debug endpoint disabled. Set ADMIN_SECRET env var to enable." },
      { status: 403 }
    );
  }
  const results: Record<string, unknown> = {};

  results.cwd = process.cwd();
  results.nodeVersion = process.version;

  // 1. DB file
  const dbFile = path.join(process.cwd(), "data", "flight-log.db");
  results.dbPath = dbFile;
  results.dbExists = fs.existsSync(dbFile);
  if (results.dbExists) {
    results.dbSizeBytes = fs.statSync(dbFile).size;
  }

  // 2. node-sqlite3-wasm .wasm file — cPanel deploy zna stripati .wasm datoteke,
  // pa eksplicitno provjeri da je stigla (bez nje driver ne može ni initi).
  const wasmFile = path.join(
    process.cwd(), "node_modules", "node-sqlite3-wasm", "dist", "node-sqlite3-wasm.wasm"
  );
  results.wasmPath = wasmFile;
  results.wasmExists = fs.existsSync(wasmFile);

  // 3. Try to open the DB with the same driver the read-path and poller use.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require("node-sqlite3-wasm") as
      typeof import("node-sqlite3-wasm");
    results.driverInit = "ok";

    if (results.dbExists) {
      const db = new Database(dbFile, { readOnly: true });
      try {
        results.positionCount = db.get("SELECT COUNT(*) AS n FROM positions");
        results.tableCount = db.get(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'"
        );
        results.tables = (
          db.all("SELECT name FROM sqlite_master WHERE type='table'") as Array<{
            name: string;
          }>
        ).map((t) => t.name);
        results.dbQueryTest = "ok";
      } catch (e) {
        results.dbQueryError = e instanceof Error ? e.message : String(e);
      } finally {
        db.close();
      }
    }
  } catch (e) {
    results.driverInitError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
