/**
 * Pi svrsta prekid pod `server` čim ping i DNS rade, a POST snimka ne prođe.
 * To ne znači da je server kriv: 18. 11. 2026. (nestanak struje u Lekeniku,
 * mobilna mreža na baterijama) 189 od 190 takvih prekida bili su istek veze
 * (`curl: (28)`) ili prekinut prijenos (`curl: (56)`), a server je radio.
 * Oznaka zato ide po stvarnoj grešci iz `detail`.
 */
export type UploadFailureKind =
  /** Istek ili prekid usred prijenosa: najčešće slaba ili preopterećena mreža. */
  | "slow-network"
  /** Veza do servera odbijena ili nedostupna. */
  | "no-connection"
  /** Server je odgovorio, ali nije prihvatio snimak (HTTP ≠ 200). */
  | "server-error"
  | "unknown";

/** curl kodovi za istek i prekid prijenosa (timeout, recv/send, TLS usred veze). */
const SLOW_NETWORK_CURL_CODES = new Set([16, 18, 28, 35, 52, 55, 56, 92]);

export function uploadFailureKind(detail: string | null | undefined): UploadFailureKind {
  if (!detail) return "unknown";
  if (/\bHTTP [1-9]\d\d\b/.test(detail)) return "server-error";
  const curl = /curl: \((\d+)\)/.exec(detail);
  if (!curl) return "unknown";
  const code = Number(curl[1]);
  if (SLOW_NETWORK_CURL_CODES.has(code)) return "slow-network";
  if (code === 7) return "no-connection";
  return "unknown";
}
