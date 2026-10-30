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
    return "bg-[color:var(--disc)]";
  }
  if (tier === "caution") {
    return "bg-[color:var(--moon)]";
  }
  return "bg-[color:var(--live)]";
}

function tierLabelClass(tier: MoonFieldVisibilityTier): string {
  if (tier === "critical") {
    return "text-[color:var(--disc-text)]";
  }
  if (tier === "caution") {
    return "text-[color:var(--moon)]";
  }
  return "text-[color:var(--live)]";
}

function moonRowLabel(icon: ReactNode, text: string) {
  return (
    <dt className="flex min-w-0 items-center gap-2 text-[color:var(--t-secondary)]">
      {icon}
      <span>{text}</span>
    </dt>
  );
}

/** Lokalni sat izlaza/zlaza. Dan bez tog događaja je stvaran slučaj (lunarni dan traje ~24 h 50 min). */
function riseSetDisplay(
  t: Date | null,
  show: boolean,
  hasMounted: boolean
): string {
  if (!show || !hasMounted) {
    return "—";
  }
  if (t == null) {
    return "None today";
  }
  return t.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function riseSetUtcTitle(t: Date | null): string | undefined {
  return t == null ? undefined : `${t.toISOString().slice(11, 16)} UTC`;
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
  const illuminationAdvice = useMemo(() => {
    if (!showEphemeris) return null;
    const pct = moon.illuminationFraction * 100;
    if (pct < 5) {
      return {
        label: "Near new moon",
        message: "Moon too dark to photograph — not visible to the naked eye.",
        colorClass: "text-[color:var(--moon)]",
      };
    }
    if (pct < 20) {
      return {
        label: "Thin crescent",
        message: "Low contrast — hard to locate; best in twilight near horizon.",
        colorClass: "text-[color:var(--moon)]",
      };
    }
    return null;
  }, [showEphemeris, moon.illuminationFraction]);

  return (
    <div className="space-y-3">
      {isMoonBelowHorizon && showEphemeris ? (
        <p className="mb-2.5 text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">Moon below horizon</p>
      ) : null}
      {balconyIdealForTransitWatch ? (
        <div
          className="mt-note mb-3"
          role="status"
          aria-live="polite"
          data-testid="moon-balcony-transit-watch-ideal"
        >
          <p className="mt-section-label text-[color:var(--moon)]">
            Ideal for transit watch
          </p>
          <p className="mt-1.5 text-[length:var(--fs-body)] leading-snug text-[color:var(--ink)]">
            Moon height, direction, and phase match the saved balcony reference — clear sight line; a good time to wait on a moon crossing.
          </p>
        </div>
      ) : null}
      <dl className="space-y-2 text-[length:var(--fs-body)]">
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconAltitude />, "Altitude")}
          <dd className="flex items-center justify-end gap-2 tabular-nums">
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
          <dd className="tabular-nums">
            {display(formatFixed(moon.azimuthDeg))}°
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconAngularRadius />, "Angular radius")}
          <dd className="tabular-nums">
            {display(formatFixed(moon.apparentRadius.degrees, 3))}°
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconIlluminated />, "Illuminated")}
          <dd className="tabular-nums" title="Fraction of the lunar disk lit as seen from Earth (0% = new, 100% = full)">
            {display(
              formatFixed(Math.min(1, Math.max(0, moon.illuminationFraction)) * 100, 0)
            )}
            %
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconMoonrise />, "Moonrise")}
          <dd className="tabular-nums" title={riseSetUtcTitle(moonRise)} suppressHydrationWarning>
            {moonRiseSetKind === "alwaysUp"
              ? "Circumpolar (up)"
              : moonRiseSetKind === "alwaysDown"
                ? "Circumpolar (down)"
                : riseSetDisplay(moonRise, showEphemeris, hasMounted)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          {moonRowLabel(<MoonRowIconMoonset />, "Moonset")}
          <dd className="tabular-nums" title={riseSetUtcTitle(moonSet)} suppressHydrationWarning>
            {moonRiseSetKind === "alwaysUp" || moonRiseSetKind === "alwaysDown"
              ? "—"
              : riseSetDisplay(moonSet, showEphemeris, hasMounted)}
          </dd>
        </div>
      </dl>
      {visibilityAdvice ? (
        <div
          className="mt-3 border-t border-[color:var(--hair-soft)] pt-3 space-y-1.5"
          aria-live="polite"
        >
          <p className="mt-section-label">
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
                    ? "text-[color:var(--moon)]"
                    : cloudCoverPercent >= 40
                      ? "text-[color:var(--moon)]"
                      : "text-[color:var(--live)]"
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
          {illuminationAdvice ? (
            <p className="text-[length:var(--fs-meta)] leading-relaxed text-[color:var(--t-secondary)]">
              <span className="font-semibold text-[color:var(--t-primary)]">Phase: </span>
              <span className={`font-semibold ${illuminationAdvice.colorClass}`}>
                {illuminationAdvice.label}
              </span>
              {" — "}
              {illuminationAdvice.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
