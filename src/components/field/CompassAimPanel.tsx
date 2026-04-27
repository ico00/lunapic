"use client";

import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconCompass } from "@/components/shell/sectionCategoryIcons";
import { useDeviceCompass } from "@/hooks/useDeviceCompass";
import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import { useCallback, useState } from "react";

/**
 * Frame for plan view: turn until the arrow (upward) lines up with the
 * moon azimuth. Status below the disc (not absolute) — stable flow on mobile.
 */
export function CompassAimPanel() {
  const moon = useMoonStateComputed();
  const { headingDeg, hasHeading, needPermission, request, listening } =
    useDeviceCompass();
  const [err, setErr] = useState<string | null>(null);

  const onEnable = useCallback(async () => {
    setErr(null);
    const r = await request();
    if (r != null) {
      setErr(r);
    }
  }, [request]);

  const delta =
    hasHeading && headingDeg != null
      ? ((moon.azimuthDeg - headingDeg + 540) % 360) - 180
      : 0;

  return (
    <ShellSectionCard
      className="mt-3"
      title="Compass → Moon"
      accent="lime"
      icon={<SectionIconCompass />}
    >
      <p className="text-[0.6rem] leading-relaxed text-zinc-500">
        Phone, est. gyro — open air, magnetic interference. Goal: arrow straight
        up = lens on plan-view moon azimuth (N=0).
      </p>
      {!listening && needPermission && (
        <button
          type="button"
          onClick={onEnable}
          className="mt-2 w-full rounded-lg border border-lime-700/50 bg-lime-950/40 py-1.5 text-sm text-lime-100/90"
        >
          Allow orientation (iOS)
        </button>
      )}
      {err && <p className="mt-2 text-[0.65rem] text-red-400/90">{err}</p>}
      {listening && (
        <div className="mt-3 flex w-full min-w-0 flex-col items-center gap-2">
          <div
            className="relative h-[7.5rem] w-[7.5rem] shrink-0 overflow-visible rounded-full border-2 border-zinc-600 bg-zinc-950/80"
            aria-label="Compass for direction relative to moon azimuth"
          >
            <span className="absolute left-1/2 top-2 -translate-x-1/2 text-[0.5rem] text-zinc-500">
              N
            </span>
            <div
              className="absolute left-1/2 top-1/2 w-0.5 rounded-full bg-amber-200 shadow shadow-amber-500/20"
              style={{
                height: 40,
                transform: `translate(-50%, -100%) rotate(${delta}deg)`,
                transformOrigin: "50% 100%",
              }}
            />
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400" />
          </div>
          <p className="w-full min-w-0 break-words px-1 text-center text-[0.7rem] leading-snug text-zinc-400">
            {hasHeading
              ? `Turn ≈ ${Math.abs(delta).toFixed(0)}° ${
                  delta > 0 ? "↻" : "↺"
                }`
              : "Waiting for sensor… (hold the phone in landscape if supported)"}
          </p>
        </div>
      )}
    </ShellSectionCard>
  );
}
