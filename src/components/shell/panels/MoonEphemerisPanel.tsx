"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  MoonRowIconAltitude,
  MoonRowIconAngularRadius,
  MoonRowIconAzimuth,
  MoonRowIconIlluminated,
  MoonRowIconMoonrise,
  MoonRowIconMoonset,
} from "@/components/shell/panels/moonEphemerisRowIcons";
import { useHasMounted } from "@/hooks/useHasMounted";
import { isBalconyTransitWatchIdeal } from "@/lib/domain/astro/balconyTransitWatchIdeal";
import {
  moonFieldVisibilityAdvice,
  type MoonFieldVisibilityTier,
} from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { formatFixed } from "@/lib/format/numbers";
import type { GroundObserver } from "@/types/geo";
import type { MoonRiseSetKind, MoonState } from "@/types/moon";

/** Altitude row dot: red = poor / hidden band, amber = marginal, green = good for field use. */
function tierDotClass(tier: MoonFieldVisibilityTier): string {
  if (tier === "critical") {
    return "bg-red-500 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]";
  }
  if (tier === "caution") {
    return "bg-amber-400 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]";
  }
  return "bg-emerald-500 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]";
}

function tierLabelClass(tier: MoonFieldVisibilityTier): string {
  if (tier === "critical") {
    return "text-red-400/95";
  }
  if (tier === "caution") {
    return "text-amber-400/95";
  }
  return "text-emerald-400/95";
}

function moonRowLabel(icon: ReactNode, text: string) {
  return (
    <dt className="flex min-w-0 items-center gap-2 text-zinc-300/85">
      {icon}
      <span>{text}</span>
    </dt>
  );
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
  /** Fiksni promatrač (isti kao u geometriji) — za “ideal balcony” upozorenje. */
  observer: GroundObserver;
  /** Vrijednost prikaza ili “—“ dok ephemeris nije spreman. */
  display: (v: string) => string;
  moonRise: Date | null;
  moonSet: Date | null;
  moonRiseSetKind: MoonRiseSetKind;
  showEphemeris: boolean;
  isMoonBelowHorizon: boolean;
  cloudCoverPercent?: number | null;
};

export function MoonEphemerisPanel({
  moon,
  observer,
  display,
  moonRise,
  moonSet,
  moonRiseSetKind,
  showEphemeris,
  isMoonBelowHorizon,
  cloudCoverPercent = null,
}: MoonEphemerisPanelProps) {
  const hasMounted = useHasMounted();
  const visibilityAdvice = showEphemeris
    ? moonFieldVisibilityAdvice(moon.altitudeDeg)
    : null;
  const balconyIdealForTransitWatch = useMemo(
    () =>
      showEphemeris &&
      !isMoonBelowHorizon &&
      isBalconyTransitWatchIdeal(moon, observer),
    [showEphemeris, isMoonBelowHorizon, moon, observer]
  );
  const moonriseNoteText = useMemo(() => {
    if (moonRiseSetKind === "alwaysUp") {
      return "Circumpolar (up)";
    }
    if (moonRiseSetKind === "alwaysDown") {
      return "Circumpolar (down)";
    }
    return timeDisplay(moonRise, showEphemeris, hasMounted);
  }, [moonRise, moonRiseSetKind, showEphemeris, hasMounted]);

  const moonsetNoteText = useMemo(() => {
    if (moonRiseSetKind === "alwaysUp" || moonRiseSetKind === "alwaysDown") {
      return "—";
    }
    return timeDisplay(moonSet, showEphemeris, hasMounted);
  }, [moonSet, moonRiseSetKind, showEphemeris, hasMounted]);

  const visibilitySummary = useMemo(() => {
    if (!visibilityAdvice) {
      return null;
    }
    return `${visibilityAdvice.label} — ${visibilityAdvice.message}`;
  }, [visibilityAdvice]);

  return (
    <div className="space-y-3">
      {isMoonBelowHorizon && showEphemeris ? (
        <p className="mb-2.5 text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">Moon below horizon</p>
      ) : null}
      {balconyIdealForTransitWatch ? (
        <div
          className="mb-3 rounded-2xl border border-yellow-400/45 bg-yellow-400/[0.10] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          role="status"
          aria-live="polite"
          data-testid="moon-balcony-transit-watch-ideal"
        >
          <p className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-yellow-200">
            Ideal for transit watch
          </p>
          <p className="mt-1.5 text-[length:var(--fs-body)] leading-snug text-yellow-100/95">
            Moon height, direction, and phase match the saved balcony reference — clear sight line; a good time to wait on a moon crossing.
          </p>
        </div>
      ) : null}
      <dl className="space-y-2 text-[length:var(--fs-body)]">
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconAltitude />, "Altitude")}
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
          {moonRowLabel(<MoonRowIconAzimuth />, "Azimuth (N)")}
          <dd className="font-mono tabular-nums">
            {display(formatFixed(moon.azimuthDeg))}°
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconAngularRadius />, "Angular radius")}
          <dd className="font-mono tabular-nums">
            {display(formatFixed(moon.apparentRadius.degrees, 3))}°
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconIlluminated />, "Illuminated")}
          <dd className="font-mono tabular-nums" title="Fraction of the lunar disk lit as seen from Earth (0% = new, 100% = full)">
            {display(
              formatFixed(Math.min(1, Math.max(0, moon.illuminationFraction)) * 100, 0)
            )}
            %
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconMoonrise />, "Moonrise (UTC day)")}
          <dd className="font-mono tabular-nums" suppressHydrationWarning>
            {moonRiseSetKind === "alwaysUp"
              ? "Circumpolar (up)"
              : moonRiseSetKind === "alwaysDown"
                ? "Circumpolar (down)"
                : timeDisplay(moonRise, showEphemeris, hasMounted)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconMoonset />, "Moonset (UTC day)")}
          <dd className="font-mono tabular-nums" suppressHydrationWarning>
            {moonRiseSetKind === "alwaysUp" || moonRiseSetKind === "alwaysDown"
              ? "—"
              : timeDisplay(moonSet, showEphemeris, hasMounted)}
          </dd>
        </div>
      </dl>
      {visibilityAdvice ? (
        <div
          className="mt-3 border-t border-white/[0.08] pt-3 space-y-1.5"
          aria-live="polite"
        >
          <p className="text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-tertiary)]">
            Visibility advice
          </p>
          <p className="text-[length:var(--fs-meta)] leading-relaxed text-[color:var(--t-secondary)]">
            <span className="font-semibold text-[color:var(--t-primary)]">Elevation: </span>
            <span className={`font-semibold ${tierLabelClass(visibilityAdvice.tier)}`}>{visibilityAdvice.label}</span>
            {" — "}
            {visibilityAdvice.message}
          </p>
          {cloudCoverPercent != null ? (
            <p className="text-[length:var(--fs-meta)] leading-relaxed text-[color:var(--t-secondary)]">
              <span className="font-semibold text-[color:var(--t-primary)]">Clouds: </span>
              <span
                className={`font-semibold ${
                  cloudCoverPercent >= 80
                    ? "text-red-400"
                    : cloudCoverPercent >= 40
                      ? "text-amber-400"
                      : "text-emerald-400"
                }`}
              >
                {cloudCoverPercent}%
              </span>
              {" — "}
              {cloudCoverPercent >= 80
                ? "moon likely obscured."
                : cloudCoverPercent >= 40
                  ? "moon visibility may be intermittent."
                  : "skies mostly clear."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
