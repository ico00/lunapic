/**
 * Terensko / dev profiliranje: mjeri stvarno vrijeme u hookovima i na Mapboxu.
 * Uključi: `NEXT_PUBLIC_FIELD_PERF=1` u .env *ili* nakon učitavanja:
 *   localStorage.setItem('moonTransitFieldPerf', '1'); location.reload();
 * Isključi: ukloni env i `localStorage.removeItem('moonTransitFieldPerf')`.
 */

const STORAGE_KEY = "moonTransitFieldPerf";

const MAX_RING = 30;

type Ring = {
  last: number;
  sum: number;
  n: number;
  values: number[];
};

const rings = new Map<string, Ring>();

function getRing(name: string): Ring {
  let r = rings.get(name);
  if (!r) {
    r = { last: 0, sum: 0, n: 0, values: [] };
    rings.set(name, r);
  }
  return r;
}

function pushRing(r: Ring, ms: number): void {
  const v = r.values;
  v.push(ms);
  if (v.length > MAX_RING) {
    v.shift();
  }
  const n = v.length;
  r.last = ms;
  r.n = n;
  r.sum = v.reduce((a, b) => a + b, 0);
}

export function isFieldPerfEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (process.env.NEXT_PUBLIC_FIELD_PERF === "1") {
    return true;
  }
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Pozovi iz `setInterval` / overlay subscribe da force-aš ažuriranje UI-a nakon prve crte.
 */
export function fieldPerfRecord(name: string, durationMs: number): void {
  if (!isFieldPerfEnabled() || !Number.isFinite(durationMs)) {
    return;
  }
  const r = getRing(name);
  pushRing(r, durationMs);
  if (typeof globalThis !== "undefined") {
    try {
      globalThis.dispatchEvent(
        new CustomEvent("moon-transit-field-perf", { detail: { name, ms: durationMs } })
      );
    } catch {
      // ignore
    }
  }
}

export function fieldPerfTime<T>(name: string, fn: () => T): T {
  if (!isFieldPerfEnabled()) {
    return fn();
  }
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    fieldPerfRecord(name, performance.now() - t0);
  }
}

export function getFieldPerfSnapshot(): {
  readonly entries: ReadonlyArray<{
    name: string;
    last: number;
    avg: number;
    n: number;
  }>;
} {
  const entries = [...rings.entries()]
    .map(([name, r]) => ({
      name,
      last: r.last,
      avg: r.n > 0 ? r.sum / r.n : 0,
      n: r.n,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { entries };
}

export function clearFieldPerfRings(): void {
  rings.clear();
}

export const fieldPerfControl = {
  storageKey: STORAGE_KEY,
} as const;
