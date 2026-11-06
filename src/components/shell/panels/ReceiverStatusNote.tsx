"use client";

import type {
  OutageCause,
  PiOutage,
  ReceiverDiagnosis,
} from "@/lib/receiver/receiverDiagnosis";
import { appPath } from "@/lib/paths/appPath";
import { useEffect, useState } from "react";

/** Pi javlja stanje svakih ~60 s, pa češće pitati nema smisla. */
const REFRESH_MS = 30_000;
const MAX_ROWS = 5;

const CAUSE_LABEL: Record<OutageCause, string> = {
  wifi: "Wi-Fi to the access point",
  gateway: "Access point or router not answering",
  internet: "5G / internet down",
  dns: "DNS failure",
  server: "Pi could not reach the server",
  receiver: "readsb stopped decoding",
  "pi-down": "Pi was off",
};

function formatTime(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const sameDay = new Date(nowMs).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return sameDay
    ? time
    : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

function formatDuration(sec: number): string {
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 90 * 60) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}

const WARN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden>
    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
  </svg>
);

/** Rečenica „zašto ne radi”; prvi dio podebljan kao i u ostalim `.mt-note` (spec §2b.5). */
function explain(
  d: ReceiverDiagnosis | null,
  nowMs: number
): { lead: string; rest: string } | null {
  if (d == null) {
    return {
      lead: "LunaPic ADS-B unreachable.",
      rest: "This device cannot reach the LunaPic server either, so the cause is unknown. Only the other enabled sources are shown.",
    };
  }
  const since = d.sinceMs != null ? ` since ${formatTime(d.sinceMs, nowMs)}` : "";
  const signal = d.lastSignalPct != null ? ` Last Wi-Fi signal ${d.lastSignalPct} %.` : "";
  switch (d.code) {
    case "pi-silent":
      return {
        lead: `No contact with the Raspberry Pi${since}.`,
        rest: `Power, Wi-Fi or 5G. The Pi reports the exact cause once it is back.${signal}`,
      };
    case "push-failing":
      return {
        lead: `The Pi is online, but its data does not reach the server${since}.`,
        rest: d.detail ? `Last error: ${d.detail}.` : "The Pi has not reported an error yet.",
      };
    case "receiver-stale":
      return {
        lead: `The Pi is online, but readsb is not decoding${since}.`,
        rest: "Check the SDR dongle or restart readsb.",
      };
    case "no-aircraft":
      return {
        lead: "The Pi sends data, but sees no aircraft.",
        rest: "Check the antenna and the SDR dongle.",
      };
    case "no-data":
      return {
        lead: "The server has never received data from the Pi.",
        rest: "Check the push service on the Pi.",
      };
    case "ok":
      return null;
  }
}

function OutageRow({ o, nowMs }: { o: PiOutage; nowMs: number }) {
  const detail = [
    o.detail,
    o.minSignalPct != null ? `Wi-Fi signal down to ${o.minSignalPct} %` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    // `contents`: stupci se poravnavaju u gridu roditelja, pa title ide na ćelije.
    <li className="contents">
      <span className="tabular-nums text-[color:var(--t-tertiary)]" title={detail || undefined}>
        {formatTime(o.start * 1000, nowMs)}
      </span>
      <span className="text-right tabular-nums" title={detail || undefined}>
        {formatDuration(o.end - o.start)}
      </span>
      <span className="min-w-0 truncate text-[color:var(--t-primary)]" title={detail || undefined}>
        {CAUSE_LABEL[o.cause]}
      </span>
    </li>
  );
}

/**
 * Zašto LunaPic ADS-B ne radi i nedavni prekidi s uzrokom (spec §4a.2c).
 * `clientUnreachable` = klijent ne dobiva podatke (`localsdrStatus`); bilješka se
 * pokazuje i kad klijent dobiva podatke, ali server zna da su loši (readsb stoji,
 * nema aviona).
 */
export function ReceiverStatusNote({
  diagnosis,
  loaded,
  nowMs,
  clientUnreachable,
}: {
  diagnosis: ReceiverDiagnosis | null;
  loaded: boolean;
  /** Trenutak zadnjeg dohvata — za „danas” u formatu vremena. */
  nowMs: number;
  clientUnreachable: boolean;
}) {
  const text =
    diagnosis?.code === "ok" && clientUnreachable
      ? {
          lead: "LunaPic ADS-B unreachable from this device.",
          rest: "The server is receiving fresh data from the Pi, so the problem is between this device and the server.",
        }
      : clientUnreachable || (diagnosis != null && diagnosis.code !== "ok")
        ? loaded
          ? explain(diagnosis, nowMs)
          : null
        : null;
  const outages = diagnosis?.recentOutages.slice(0, MAX_ROWS) ?? [];

  if (text == null && outages.length === 0) {
    return null;
  }
  return (
    <div className="mt-1.5 flex flex-col gap-1.5" data-testid="localsdr-status">
      {text && (
        <div className="mt-note mt-note-disc flex items-start gap-2 !px-2.5 !py-2 !text-[length:var(--fs-label)]">
          {WARN_ICON}
          <span>
            <strong>{text.lead}</strong> {text.rest}
            {clientUnreachable && diagnosis?.code !== "ok" ? " Only the other enabled sources are shown." : ""}
          </span>
        </div>
      )}
      {outages.length > 0 && (
        <div className="px-2.5" data-testid="localsdr-outages">
          <p className="mt-section-label pb-0.5">LunaPic ADS-B outages · 7 days</p>
          <ul className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[length:var(--fs-label)] text-[color:var(--t-secondary)]">
            {outages.map((o) => (
              <OutageRow key={`${o.start}:${o.cause}`} o={o} nowMs={nowMs} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Dijagnoza dok je izvor uključen i panel otvoren; neuspjeh = `null` uz `loaded`. */
type ReceiverDiagnosisState = {
  diagnosis: ReceiverDiagnosis | null;
  loaded: boolean;
  /** Kad je stigao zadnji odgovor (epoch ms). */
  atMs: number;
};

export function useReceiverDiagnosis(enabled: boolean): ReceiverDiagnosisState {
  const [state, setState] = useState<ReceiverDiagnosisState>({
    diagnosis: null,
    loaded: false,
    atMs: 0,
  });
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const ac = new AbortController();
    const load = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void fetch(appPath("/api/localsdr/status"), { signal: ac.signal, cache: "no-store" })
        // Odgovor s greškom (npr. 429) ostavlja zadnju dijagnozu; samo mrežna
        // greška znači da ni server nije dostupan.
        .then((res) => (res.ok ? (res.json() as Promise<ReceiverDiagnosis>) : undefined))
        .then((diagnosis) =>
          setState((prev) =>
            diagnosis === undefined
              ? { ...prev, loaded: true, atMs: Date.now() }
              : { diagnosis, loaded: true, atMs: Date.now() }
          )
        )
        .catch(() => {
          if (!ac.signal.aborted) {
            setState({ diagnosis: null, loaded: true, atMs: Date.now() });
          }
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(timer);
      ac.abort();
    };
  }, [enabled]);
  return state;
}
