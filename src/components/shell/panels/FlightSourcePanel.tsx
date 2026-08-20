"use client";

import { Fragment } from "react";
import { shellAccentCheckboxClass } from "@/lib/ui/shellComboboxStyles";
import {
  type LiveFlightFeeds,
  type WebFeedStatus,
  useMoonTransitStore,
} from "@/stores/moon-transit-store";
import {
  FLIGHT_PROVIDER_COMBO_IDS,
  type FlightProviderId,
} from "@/types/flight-provider";

function labelForProvider(id: FlightProviderId): string {
  if (id === "adsbone") return "adsb.lol";
  if (id === "localsdr") return "LunaPic ADS-B";
  if (id === "avionix") return "Avionix Nano";
  return "OpenSky";
}

function feedFor(id: FlightProviderId, feeds: LiveFlightFeeds): boolean {
  if (id === "opensky") return feeds.opensky;
  if (id === "adsbone") return feeds.adsbone;
  if (id === "localsdr") return feeds.localsdr;
  return feeds.avionix;
}

const rowBase =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[length:var(--fs-body)] select-none transition-colors";
const rowClass = (on: boolean) =>
  on
    ? `${rowBase} bg-sky-500/15 text-sky-200`
    : `${rowBase} text-[color:var(--t-secondary)] hover:bg-zinc-800 hover:text-[color:var(--t-primary)]`;

type ProviderCounts = {
  opensky: number;
  adsbone: number;
  localsdr: number;
  avionix: number;
};

type FlightSourcePanelProps = {
  liveFlightFeeds: LiveFlightFeeds;
  onLiveFlightFeedsChange: (patch: Partial<LiveFlightFeeds>) => void;
  providerFlightCounts: ProviderCounts;
};

function countFor(id: FlightProviderId, counts: ProviderCounts): number {
  if (id === "opensky") return counts.opensky;
  if (id === "adsbone") return counts.adsbone;
  if (id === "localsdr") return counts.localsdr;
  return counts.avionix;
}

/** Badge tekst za web izvor, ili `null` kad je sve u redu (tada ide broj letova). */
function webBadge(
  status: WebFeedStatus
): { readonly label: string; readonly tone: "amber" | "rose" } | null {
  if (status === "rate-limited") return { label: "rate limited", tone: "amber" };
  if (status === "error") return { label: "unavailable", tone: "rose" };
  return null;
}

const badgeToneClass = {
  amber:
    "border-amber-400/40 bg-amber-500/15 text-amber-300",
  rose: "border-rose-400/40 bg-rose-500/15 text-rose-300",
} as const;

const badgeDotClass = { amber: "bg-amber-400", rose: "bg-rose-400" } as const;

export function FlightSourcePanel({
  liveFlightFeeds,
  onLiveFlightFeedsChange,
  providerFlightCounts,
}: FlightSourcePanelProps) {
  const localsdrStatus = useMoonTransitStore((s) => s.localsdrStatus);
  const avionixStatus = useMoonTransitStore((s) => s.avionixStatus);
  const webFeedStatus = useMoonTransitStore((s) => s.webFeedStatus);
  const sdrUnreachable =
    liveFlightFeeds.localsdr && localsdrStatus === "unreachable";
  const avionixUnreachable =
    liveFlightFeeds.avionix && avionixStatus === "unreachable";
  const openSkyRateLimited =
    liveFlightFeeds.opensky && webFeedStatus.opensky === "rate-limited";
  return (
    <div className="flex flex-col gap-0.5">
      {FLIGHT_PROVIDER_COMBO_IDS.map((id) => {
        const isLocalSource = id === "localsdr" || id === "avionix";
        const feedOn = feedFor(id, liveFlightFeeds);
        const count = countFor(id, providerFlightCounts);
        const rowUnreachable =
          id === "localsdr"
            ? feedOn && sdrUnreachable
            : id === "avionix"
              ? feedOn && avionixUnreachable
              : false;
        const badge =
          !isLocalSource && feedOn
            ? webBadge(webFeedStatus[id as "opensky" | "adsbone"])
            : null;
        return (
          <Fragment key={id}>
            {id === "localsdr" && (
              <div className="my-1 border-t border-zinc-700/60" />
            )}
            <label className={rowClass(feedOn)}>
              <input
                type="checkbox"
                data-testid={`live-feed-${id}`}
                checked={feedOn}
                onChange={(e) =>
                  onLiveFlightFeedsChange(
                    id === "opensky"
                      ? { opensky: e.target.checked }
                      : id === "adsbone"
                        ? { adsbone: e.target.checked }
                        : id === "localsdr"
                          ? { localsdr: e.target.checked }
                          : { avionix: e.target.checked }
                  )
                }
                className={shellAccentCheckboxClass}
              />
              <span className="min-w-0 flex-1">{labelForProvider(id)}</span>
              {badge ? (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--fs-label)] font-semibold ${badgeToneClass[badge.tone]}`}
                  data-testid={`web-feed-status-${id}`}
                >
                  <span
                    className={`inline-block size-1.5 rounded-full ${badgeDotClass[badge.tone]}`}
                    aria-hidden
                  />
                  {badge.label}
                </span>
              ) : rowUnreachable ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[length:var(--fs-label)] font-semibold text-rose-300"
                  data-testid={`${id}-offline`}
                >
                  <span className="inline-block size-1.5 rounded-full bg-rose-400" aria-hidden />
                  offline
                </span>
              ) : (
                <>
                  {feedOn && count > 0 && (
                    <span className="shrink-0 text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
                      ({count})
                    </span>
                  )}
                  {isLocalSource && feedOn && (
                    <span className="shrink-0 text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
                      ↑ priority
                    </span>
                  )}
                </>
              )}
            </label>
          </Fragment>
        );
      })}

      {openSkyRateLimited && (
        <div className="mt-1.5 flex items-start gap-2 rounded-md border border-amber-400/25 bg-amber-500/[0.07] px-2.5 py-2 text-[length:var(--fs-label)] text-amber-200">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden>
            <path d="M12 8v5M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />
          </svg>
          <span>
            OpenSky dnevna kvota je potrošena — izvor se vraća sam kad se krediti
            obnove. Ostali uključeni izvori i dalje rade.
          </span>
        </div>
      )}

      {sdrUnreachable && (
        <div className="mt-1.5 flex items-start gap-2 rounded-md border border-rose-400/25 bg-rose-500/[0.07] px-2.5 py-2 text-[length:var(--fs-label)] text-rose-200">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden>
            <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
          <span>
            LunaPic ADS-B prijemnik nedostupan — provjeri Raspberry Pi i Tailscale Funnel.
            Prikazuju se samo ostali uključeni izvori.
          </span>
        </div>
      )}

      {avionixUnreachable && (
        <div
          className="mt-1.5 flex items-start gap-2 rounded-md border border-rose-400/25 bg-rose-500/[0.07] px-2.5 py-2 text-[length:var(--fs-label)] text-rose-200"
          data-testid="avionix-offline-notice"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden>
            <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
          <span>
            Avionix Nano prijemnik nedostupan — provjeri uređaj. Prikazuju se
            samo ostali uključeni izvori.
          </span>
        </div>
      )}
    </div>
  );
}
