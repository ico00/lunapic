"use client";

import type { RunwayInUse } from "@/lib/domain/geometry/runwayInUse";
import { appPath } from "@/lib/paths/appPath";
import { useEffect, useState } from "react";

/** Matches the route's cache: asking sooner would only return the same answer. */
const REFRESH_MS = 60_000;

/** The plan draws landing 04 and departure 22, both on the south-west side. */
const PLAN_NOTE: Record<NonNullable<RunwayInUse["runway"]>, string> = {
  "04": "The Landing 04 line applies. Departures leave north-east, which this plan does not draw.",
  "22": "The Departure 22 line applies. Landings come in from the north-east, which this plan does not draw.",
};

export function RunwayInUseNote({ status }: { status: RunwayInUse | null }) {
  if (status == null) {
    return null;
  }
  const count = status.runway === "22" ? status.aircraft22 : status.aircraft04;
  return (
    <div
      className="space-y-0.5 text-[length:var(--fs-meta)] text-[color:var(--t-secondary)]"
      data-testid="planning-runway-in-use"
    >
      {status.runway == null ? (
        <p>
          <span className="text-[color:var(--t-primary)]">Runway in use is unclear.</span> Too little
          low traffic in the last hour, or the direction is changing.
        </p>
      ) : (
        <>
          <p>
            <span className="text-[color:var(--t-primary)]">Runway {status.runway} in use now.</span>{" "}
            {count} aircraft in the last hour, from your own receiver.
          </p>
          <p>{PLAN_NOTE[status.runway]}</p>
        </>
      )}
    </div>
  );
}

/** Live state of the airport while the panel is open; hidden if the log cannot answer. */
export function useRunwayInUse(): RunwayInUse | null {
  const [status, setStatus] = useState<RunwayInUse | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    const load = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void fetch(appPath("/api/flight-log/runway-in-use"), { signal: ac.signal })
        .then((res) => (res.ok ? (res.json() as Promise<RunwayInUse>) : null))
        .then((next) => {
          if (next) {
            setStatus(next);
          }
        })
        .catch(() => {
          /* Optional hint: a failed refresh leaves the last answer in place. */
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(timer);
      ac.abort();
    };
  }, []);
  return status;
}
