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

  // 2. sql.js WASM file
  const wasmFile = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  results.wasmPath = wasmFile;
  results.wasmExists = fs.existsSync(wasmFile);

  // 3. Try to init sql.js — koristi asm.js (čisti JS) varijantu, ISTU kao read-path
  // i poller. WASM varijanta (`require("sql.js")`) treba sql-wasm.wasm koji cPanel
  // stripa, pa bi ovdje javljala lažni ENOENT iako prava baza radi.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const init = require("sql.js/dist/sql-asm.js") as (c?: object) => Promise<unknown>;
    const SQL = await init();
    results.sqlJsInit = "ok";

    if (results.dbExists) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sqlAny = SQL as any;
      const buf = fs.readFileSync(dbFile);
      const db = new sqlAny.Database(buf);
      try {
        const stmt = db.prepare("SELECT COUNT(*) AS n FROM positions");
        stmt.step();
        results.positionCount = stmt.getAsObject();
        stmt.free();

        const stmt2 = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'");
        stmt2.step();
        results.tableCount = stmt2.getAsObject();
        stmt2.free();

        const stmt3 = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
        const tables: string[] = [];
        while (stmt3.step()) tables.push((stmt3.getAsObject() as { name: string }).name);
        stmt3.free();
        results.tables = tables;

        results.dbQueryTest = "ok";
      } catch (e) {
        results.dbQueryError = e instanceof Error ? e.message : String(e);
      } finally {
        db.close();
      }
    }
  } catch (e) {
    results.sqlJsInitError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
