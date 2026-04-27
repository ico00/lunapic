/**
 * Path za klijentski `fetch` / `Request` u ovu aplikaciju.
 * Next `basePath` nije ugrađen u apsolutne putanje koje započinju s `fetch(\`/api/...\` — treba prefiks
 * (vidi `NEXT_PUBLIC_BASE_PATH` u `next.config`, usklađen s `cpanelBasePath.cjs`).
 */
export function appPath(path: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}
