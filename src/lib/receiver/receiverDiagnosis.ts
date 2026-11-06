/**
 * Zašto LunaPic ADS-B (Pi) ne radi — iz onoga što server vidi sam (snimak) i
 * onoga što je Pi javio (`/api/localsdr/diag`). Čista funkcija, dijele je ruta
 * `/api/localsdr/status` i testovi; UI samo prikazuje rezultat.
 *
 * Dok veza traje, Pi ne može javiti ništa, pa je `pi-silent` jedini mogući
 * odgovor za prekid u tijeku. Uzrok tog prekida stiže kad se Pi vrati i vidi se
 * u `recentOutages`.
 */

export type OutageCause =
  | "wifi"
  | "gateway"
  | "internet"
  | "dns"
  | "server"
  | "receiver"
  | "pi-down";

export type PiOutage = {
  /** Epoch sekunde. */
  readonly start: number;
  readonly end: number;
  readonly cause: OutageCause;
  readonly detail: string | null;
  readonly minSignalPct: number | null;
  readonly ticks: Partial<Record<OutageCause, number>>;
  readonly interruptedByBoot: boolean;
};

export type PiStatus = {
  /** Epoch sekunde (sat Pija). */
  readonly at: number;
  readonly state: "ok" | OutageCause | null;
  readonly detail: string | null;
  readonly uptimeSec: number | null;
  readonly signalPct: number | null;
  readonly throttled: string | null;
  readonly load1: number | null;
  readonly readsbAgeSec: number | null;
  readonly aircraft: number | null;
  readonly pushLastOkAgeSec: number | null;
  readonly pushLastError: string | null;
  readonly pushLastErrorAt: number | null;
};

export type ReceiverDiagnosisCode =
  /** Snimak stiže i mijenja se. */
  | "ok"
  /** Snimak ne stiže, a ni Pi se ne javlja: struja, Wi-Fi, ruter ili 5G. */
  | "pi-silent"
  /** Pi se javlja, ali snimak ne stiže: slanje ne uspijeva. */
  | "push-failing"
  /** Snimak stiže, ali readsb ga ne obnavlja: dongle ili readsb. */
  | "receiver-stale"
  /** Snimak stiže, ali bez ijednog aviona: antena ili dongle. */
  | "no-aircraft"
  /** Pi nikad nije poslao ništa. */
  | "no-data";

export type ReceiverDiagnosis = {
  readonly code: ReceiverDiagnosisCode;
  /** Od kad traje (epoch ms), kad se zna. */
  readonly sinceMs: number | null;
  /** Kratko objašnjenje s Pija (greška slanja i sl.), ili null. */
  readonly detail: string | null;
  /** Zadnji poznati Wi-Fi signal Pija (%). */
  readonly lastSignalPct: number | null;
  /** Kad je Pi zadnji put javio stanje (epoch ms). */
  readonly piReportedAtMs: number | null;
  /** Prekidi od barem `MIN_LISTED_OUTAGE_SEC`, najnoviji prvi. */
  readonly recentOutages: readonly PiOutage[];
};

export type SnapshotMeta = {
  /** Kad je server primio snimak (epoch ms). */
  readonly receivedAt: number;
  /** Polje `now` iz `aircraft.json` (epoch sekunde, sat Pija), ili null. */
  readonly readsbNowSec: number | null;
  readonly aircraftCount: number | null;
};

/** Isto kao `SNAPSHOT_STALE_AFTER_MS` u `sdrSnapshot.cjs`. */
export const SNAPSHOT_STALE_AFTER_MS = 60_000;
/** Pi javlja stanje svakih ~60 s; dvostruko uz rezervu za spori 5G. */
export const PI_REPORT_STALE_AFTER_MS = 150_000;
/** readsb piše `aircraft.json` svake sekunde. */
export const READSB_STALE_AFTER_SEC = 30;
/**
 * Kraći prekidi ne gase prijemnik u aplikaciji (snimak smije kasniti 60 s), pa
 * ih nema smisla nabrajati; Pi ih ipak šalje radi analize.
 */
export const MIN_LISTED_OUTAGE_SEC = 60;
export const MAX_LISTED_OUTAGES = 10;
/** Starije od ovoga ne zanima nikoga tko gleda zašto prijemnik ne radi sada. */
export const LISTED_OUTAGE_WINDOW_MS = 7 * 24 * 3600_000;

export function diagnoseReceiver(input: {
  readonly snapshot: SnapshotMeta | null;
  readonly diag: {
    readonly receivedAt: number | null;
    readonly status: PiStatus | null;
    readonly outages: readonly PiOutage[];
  };
  readonly nowMs: number;
}): ReceiverDiagnosis {
  const { snapshot, diag, nowMs } = input;
  const status = diag.status;
  const piReportedAtMs = diag.receivedAt;
  const piReporting =
    piReportedAtMs != null && nowMs - piReportedAtMs <= PI_REPORT_STALE_AFTER_MS;

  const recentOutages = diag.outages
    .filter(
      (o) =>
        o.end - o.start >= MIN_LISTED_OUTAGE_SEC &&
        nowMs - o.end * 1000 <= LISTED_OUTAGE_WINDOW_MS
    )
    .slice(0, MAX_LISTED_OUTAGES);

  const base = {
    lastSignalPct: status?.signalPct ?? null,
    piReportedAtMs,
    recentOutages,
  };

  if (snapshot == null && piReportedAtMs == null) {
    return { ...base, code: "no-data", sinceMs: null, detail: null };
  }

  const snapshotFresh =
    snapshot != null && nowMs - snapshot.receivedAt <= SNAPSHOT_STALE_AFTER_MS;

  if (!snapshotFresh) {
    if (piReporting) {
      return {
        ...base,
        code: "push-failing",
        sinceMs: snapshot?.receivedAt ?? null,
        detail: status?.pushLastError ?? status?.detail ?? null,
      };
    }
    // Zadnji znak života je ono što je stiglo kasnije: snimak ili izvještaj.
    const lastSeen = Math.max(snapshot?.receivedAt ?? 0, piReportedAtMs ?? 0);
    return {
      ...base,
      code: "pi-silent",
      sinceMs: lastSeen > 0 ? lastSeen : null,
      detail: null,
    };
  }

  // Snimak stiže. `now` je sat Pija, `receivedAt` sat servera; oba su
  // NTP-sinkronizirana, a prag od 30 s daleko je iznad njihovog odstupanja.
  if (
    snapshot.readsbNowSec != null &&
    snapshot.receivedAt / 1000 - snapshot.readsbNowSec > READSB_STALE_AFTER_SEC
  ) {
    return {
      ...base,
      code: "receiver-stale",
      sinceMs: snapshot.readsbNowSec * 1000,
      detail: status?.detail ?? null,
    };
  }
  if (snapshot.aircraftCount === 0) {
    return { ...base, code: "no-aircraft", sinceMs: null, detail: null };
  }
  return { ...base, code: "ok", sinceMs: null, detail: null };
}
