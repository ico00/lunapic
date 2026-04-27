/**
 * Custom HTTP server for self-hosted Node (e.g. cPanel Application Manager / Node.js Selector).
 *
 * Deploy: `npm ci` (or `npm install`), `npm run build`, then start with
 * `npm run start:cpanel` or set the application startup file to `server.js`.
 * cPanel usually sets PORT; bind address defaults to 0.0.0.0 so the reverse proxy can reach the app.
 *
 * Do not use with `output: 'standalone'` — use `.next/standalone/server.js` from the standalone
 * build instead, or remove `output: 'standalone'` from next.config.
 *
 * Sub-URL: vrijednost je u `cpanelBasePath.cjs` (isti kao `basePath` u `next build`).
 */

const { createServer } = require("node:http");
const { parse } = require("node:url");
const next = require("next");
const path = require("node:path");
const { createRequire } = require("node:module");

const requireFromRoot = createRequire(
  path.join(process.cwd(), "package.json")
);
const basePath = requireFromRoot(
  path.resolve(process.cwd(), "cpanelBasePath.cjs")
);
const basePathClean =
  String(basePath).trim().replace(/\/$/, "") || null;

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const bindHost = process.env.BIND_HOST ?? "0.0.0.0";
/** Used by Next for dev/router; does not have to match the public domain behind a proxy. */
const nextHostname = process.env.NEXT_HOST ?? "localhost";

/**
 * cPanel/Passenger often forwards requests to the process with paths **stripped** of the
 * sub-URL, while Next with `basePath` expects the full path.
 */
function alignRequestUrlForSubdir(req) {
  if (!basePathClean || !req.url) return;
  const raw = req.url;
  if (raw.startsWith("/")) {
    const u = new URL(raw, "http://_");
    if (
      u.pathname === basePathClean ||
      u.pathname.startsWith(`${basePathClean}/`)
    ) {
      return;
    }
    u.pathname = basePathClean + (u.pathname === "/" ? "" : u.pathname);
    req.url = u.pathname + u.search;
  }
}

const app = next({ dev, hostname: nextHostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      alignRequestUrlForSubdir(req);
      const parsedUrl = parse(req.url ?? "", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request", req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("internal server error");
      }
    }
  });

  server.listen(port, bindHost, () => {
    console.log(
      `[moon-transit] Next.js ready (dev=${dev}) on http://${bindHost}:${port}`,
    );
  });
});
