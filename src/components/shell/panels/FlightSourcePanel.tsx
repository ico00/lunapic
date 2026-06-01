"use client";

import { Fragment } from "react";
import { shellAccentCheckboxClass } from "@/lib/ui/shellComboboxStyles";
import type { LiveFlightFeeds } from "@/stores/moon-transit-store";
import {
  FLIGHT_PROVIDER_COMBO_IDS,
  type FlightProviderId,
} from "@/types/flight-provider";

function labelForProvider(id: FlightProviderId): string {
  if (id === "adsbone") return "ADS-B One";
  if (id === "localsdr") return "LunaPic ADS-B";
  return "OpenSky";
}

function feedFor(id: FlightProviderId, feeds: LiveFlightFeeds): boolean {
  if (id === "opensky") return feeds.opensky;
  if (id === "adsbone") return feeds.adsbone;
  return feeds.localsdr;
}

const rowBase =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[length:var(--fs-body)] select-none transition-colors";
const rowClass = (on: boolean) =>
  on
    ? `${rowBase} bg-sky-500/15 text-sky-200`
    : `${rowBase} text-[color:var(--t-secondary)] hover:bg-zinc-800 hover:text-[color:var(--t-primary)]`;

type ProviderCounts = { opensky: number; adsbone: number; localsdr: number };

type FlightSourcePanelProps = {
  liveFlightFeeds: LiveFlightFeeds;
  onLiveFlightFeedsChange: (patch: Partial<LiveFlightFeeds>) => void;
  providerFlightCounts: ProviderCounts;
};

function countFor(id: FlightProviderId, counts: ProviderCounts): number {
  if (id === "opensky") return counts.opensky;
  if (id === "adsbone") return counts.adsbone;
  return counts.localsdr;
}

export function FlightSourcePanel({
  liveFlightFeeds,
  onLiveFlightFeedsChange,
  providerFlightCounts,
}: FlightSourcePanelProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {FLIGHT_PROVIDER_COMBO_IDS.map((id) => {
        const isLocalsdr = id === "localsdr";
        const feedOn = feedFor(id, liveFlightFeeds);
        const count = countFor(id, providerFlightCounts);
        return (
          <Fragment key={id}>
            {isLocalsdr && (
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
                        : { localsdr: e.target.checked }
                  )
                }
                className={shellAccentCheckboxClass}
              />
              <span className="min-w-0 flex-1">{labelForProvider(id)}</span>
              {feedOn && count > 0 && (
                <span className="shrink-0 text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
                  ({count})
                </span>
              )}
              {isLocalsdr && feedOn && (
                <span className="shrink-0 text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
                  ↑ priority
                </span>
              )}
            </label>
          </Fragment>
        );
      })}
    </div>
  );
}
