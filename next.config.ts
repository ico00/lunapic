import type { NextConfig } from "next";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const basePath: string = require(
  path.resolve(process.cwd(), "cpanelBasePath.cjs")
) as string;

/**
 * Content-Security-Policy.
 *
 * `script-src` namjerno dopušta `'unsafe-inline'`/`'unsafe-eval'` jer ih Next.js
 * hidratacija i Google Maps (Street View) JS API zahtijevaju — bez nonce-middlewarea
 * to nije moguće izbjeći. Stvarna vrijednost ove policy je zaključavanje
 * `connect-src` / `frame-ancestors` / `object-src` / `base-uri`, ne XSS na skriptama.
 *
 * Vanjski origini (potvrđeno u kodu):
 *  - Mapbox GL: api/events/tiles.mapbox.com (stilovi, glyphovi, tile-ovi preko fetch/XHR)
 *  - Google Street View: maps.googleapis.com, maps.gstatic.com, *.ggpht.com, *.google.com
 *  - OpenAIP raster tile-ovi: *.tiles.openaip.net
 *  - Weather (direktni klijentski fetch): api.open-meteo.com
 *  - ADS-B direktni fallback (kad NEXT_PUBLIC_ADSBONE_ALLOW_DIRECT=1): api.adsb.one, api.airplanes.live
 *  - Sentry (samo produkcija): *.sentry.io
 *  - Slike (kiwi logotipi, svi tile-ovi) → `img-src https:`
 *    Mjesečeve faze više nisu među njima — od 2026-08-16 disk se iscrtava lokalno
 *    (`moonPhaseGeometry.ts`) iz teksture u `public/`, bez vanjskog izvora.
 *  Aircraft index, push, te svi ostali proxyji su same-origin → pokriva `'self'`.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' https://*.google.com",
  "manifest-src 'self'",
  [
    "connect-src 'self'",
    "https://*.mapbox.com",
    "https://*.tiles.openaip.net",
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
    "https://*.googleapis.com",
    "https://*.ggpht.com",
    "https://*.google.com",
    "https://api.open-meteo.com",
    "https://api.adsb.one",
    "https://api.airplanes.live",
    "https://*.sentry.io",
  ].join(" "),
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Prevent clickjacking — app is never meant to be embedded in an iframe
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't send Referer to cross-origin destinations (keeps observer coords out of logs)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict geolocation/camera/microphone to same origin
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=()" },
  // Force HTTPS for a year. Bez `includeSubDomains`/`preload` namjerno — da ne
  // zaključa sibling subdomene na istoj apex domeni (cPanel deploy footgun).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Defense-in-depth; script-src je permisivan zbog Next/Google Maps (vidi gore).
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  basePath,
  env: {
    /** Isti `basePath` kao u buildu; klijent ga treba za `fetch` (ne nasljeđuje se automatski). */
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  transpilePackages: ["mapbox-gl"],
  // Sentry server-side paketi ne smiju biti bundlani — moraju se loadati
  // iz node_modules na runtime (Turbopack ih ne zna bundlati ispravno).
  // node-sqlite3-wasm isto: loada svoj .wasm s fs putanje relativne na modul,
  // pa bundlanje razbije rezoluciju te putanje.
  serverExternalPackages: [
    "@sentry/nextjs",
    "@sentry/core",
    "require-in-the-middle",
    "node-sqlite3-wasm",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
