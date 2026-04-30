"use client";

import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconMoon } from "@/components/shell/sectionCategoryIcons";
import { useHasMounted } from "@/hooks/useHasMounted";
import {
  moonFieldVisibilityAdvice,
  type MoonFieldVisibilityTier,
} from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { formatFixed } from "@/lib/format/numbers";
import type { MoonRiseSetKind, MoonState } from "@/types/moon";

function tierDotClass(tier: MoonFieldVisibilityTier): string {
  if (tier === "critical") {
    return "bg-rose-500 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]";
  }
  if (tier === "caution") {
    return "bg-amber-500 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]";
  }
  return "bg-emerald-500 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]";
}

function tierLabelClass(tier: MoonFieldVisibilityTier): string {
  if (tier === "critical") {
    return "text-rose-200/95";
  }
  if (tier === "caution") {
    return "text-amber-200/95";
  }
  return "text-emerald-200/95";
}

function timeDisplay(
  t: Date | null,
  show: boolean,
  hasMounted: boolean
): string {
  if (t == null || !show || !hasMounted) {
    return "—";
  }
  return t.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

type MoonEphemerisPanelProps = {
  moon: MoonState;
  /** Vrijednost prikaza ili "—" dok ephemeris nije spreman. */
  display: (v: string) => string;
  moonRise: Date | null;
  moonSet: Date | null;
  moonRiseSetKind: MoonRiseSetKind;
  showEphemeris: boolean;
  isMoonBelowHorizon: boolean;
};

export function MoonEphemerisPanel({
  moon,
  display,
  moonRise,
  moonSet,
  moonRiseSetKind,
  showEphemeris,
  isMoonBelowHorizon,
}: MoonEphemerisPanelProps) {
  const hasMounted = useHasMounted();
  const visibilityAdvice = showEphemeris
    ? moonFieldVisibilityAdvice(moon.altitudeDeg)
    : null;
  return (
    <ShellSectionCard
      className="mt-3"
      title="Moon (nowcast)"
      accent="amber"
      icon={<SectionIconMoon />}
    >
      {isMoonBelowHorizon && showEphemeris ? (
        <p className="mb-2 text-[0.7rem] text-zinc-500/90">Moon below horizon</p>
      ) : null}
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt>Altitude</dt>
          <dd className="flex items-center justify-end gap-2 font-mono tabular-nums">
            {visibilityAdvice ? (
              <span
                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tierDotClass(
                  visibilityAdvice.tier
                )}`}
                title={visibilityAdvice.message}
                aria-label={visibilityAdvice.label}
              />
            ) : null}
            <span>{display(formatFixed(moon.altitudeDeg))}°</span>
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Azimuth (N)</dt>
          <dd className="font-mono tabular-nums">
            {display(formatFixed(moon.azimuthDeg))}°
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Angular radius</dt>
          <dd className="font-mono tabular-nums">
            {display(formatFixed(moon.apparentRadius.degrees, 3))}°
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Moonrise (UTC day)</dt>
          <dd className="font-mono tabular-nums" suppressHydrationWarning>
            {moonRiseSetKind === "alwaysUp"
              ? "Circumpolar (up)"
              : moonRiseSetKind === "alwaysDown"
                ? "Circumpolar (down)"
                : timeDisplay(moonRise, showEphemeris, hasMounted)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Moonset (UTC day)</dt>
          <dd className="font-mono tabular-nums" suppressHydrationWarning>
            {moonRiseSetKind === "alwaysUp" || moonRiseSetKind === "alwaysDown"
              ? "—"
              : timeDisplay(moonSet, showEphemeris, hasMounted)}
          </dd>
        </div>
      </dl>
      {visibilityAdvice ? (
        <div
          className="mt-3 border-t border-zinc-800/70 pt-2.5"
          aria-live="polite"
        >
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-zinc-500">
            Visibility advice
          </p>
          <p
            className={`mt-1 text-xs font-semibold tracking-tight ${tierLabelClass(
              visibilityAdvice.tier
            )}`}
          >
            {visibilityAdvice.label}
          </p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-zinc-400">
            {visibilityAdvice.message}
          </p>
        </div>
      ) : null}
    </ShellSectionCard>
  );
}
