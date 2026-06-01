"use strict";

/**
 * Jedini izvor istine za parsiranje LOCAL_SDR_URL credentialsa.
 *
 * Fetch API zabranjuje credentials ugrađene u URL (`user:pass@host`) — izvuci ih
 * i vrati čisti URL + Basic `Authorization` header. Dijele ga `server.js` (CJS
 * poller) i `src/app/api/localsdr/aircraft/route.ts` (preko runtime require-a),
 * zato plain `.cjs` kao i `flightLogSchema.cjs` / `cpanelBasePath.cjs`.
 *
 * @param {string} raw  sirovi URL, eventualno s `user:pass@`
 * @returns {{ url: string, authHeader: string|null }}
 */
function parseSdrUrl(raw) {
  try {
    const u = new URL(raw);
    const { username, password } = u;
    if (username || password) {
      u.username = "";
      u.password = "";
      const token = Buffer.from(
        `${decodeURIComponent(username)}:${decodeURIComponent(password)}`
      ).toString("base64");
      return { url: u.toString(), authHeader: `Basic ${token}` };
    }
  } catch {
    // malformed URL — fall through
  }
  return { url: raw, authHeader: null };
}

module.exports = { parseSdrUrl };
