"use client";

import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import {
  MoonRowIconAltitude,
  MoonRowIconAngularRadius,
  MoonRowIconAzimuth,
  MoonRowIconIlluminated,
  MoonRowIconMoonrise,
  MoonRowIconMoonset,
} from "@/components/shell/panels/moonEphemerisRowIcons";
import {
  SectionIconMoon,
  SectionIconNote,
} from "@/components/shell/sectionCategoryIcons";
import { useHasMounted } from "@/hooks/useHasMounted";
import { isBalconyTransitWatchIdeal } from "@/lib/domain/astro/balconyTransitWatchIdeal";
import {
  moonFieldVisibilityAdvice,
  type MoonFieldVisibilityTier,
} from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { formatMoonFieldNoteText } from "@/lib/format/moonFieldNote";
import { formatFixed } from "@/lib/format/numbers";
import type { GroundObserver } from "@/types/geo";
import type { MoonRiseSetKind, MoonState } from "@/types/moon";

function tierDotClass(tier: MoonFieldVisibilityTier): string {
  if (tier === "critical") {
    return "bg-yellow-600 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]";
  }
  if (tier === "caution") {
    return "bg-yellow-500 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]";
  }
  return "bg-blue-500 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]";
}

function tierLabelClass(tier: MoonFieldVisibilityTier): string {
  if (tier === "critical") {
    return "text-yellow-500/95";
  }
  if (tier === "caution") {
    return "text-yellow-400/95";
  }
  return "text-blue-300/95";
}

function moonRowLabel(icon: ReactNode, text: string) {
  return (
    <dt className="flex min-w-0 items-center gap-2 text-zinc-400/95">
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

/** Observer + time anchor for a plain-text “field note” (balcony / stand logs). */
export type MoonFieldSnapshotContext = {
  referenceEpochMs: number;
  observerLat: number;
  observerLng: number;
  observerGroundHeightMeters: number;
};

type MoonEphemerisPanelProps = {
  moon: MoonState;
  /** Fiksni promatrač (isti kao u geometriji) — za “ideal balcony” upozorenje. */
  observer: GroundObserver;
  /** Vrijednost prikaza ili "—" dok ephemeris nije spreman. */
  display: (v: string) => string;
  moonRise: Date | null;
  moonSet: Date | null;
  moonRiseSetKind: MoonRiseSetKind;
  showEphemeris: boolean;
  isMoonBelowHorizon: boolean;
  /** Kad je postavljen i Mjesec je iznad horizonta, nudi se kopiranje bilješke u međuspremnik. */
  snapshotContext?: MoonFieldSnapshotContext | null;
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
  snapshotContext = null,
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
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle"
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

  const copyFieldNote = useCallback(async () => {
    if (!snapshotContext || !showEphemeris || isMoonBelowHorizon) {
      return;
    }
    const body = formatMoonFieldNoteText({
      referenceEpochMs: snapshotContext.referenceEpochMs,
      observerLat: snapshotContext.observerLat,
      observerLng: snapshotContext.observerLng,
      observerGroundHeightMeters: snapshotContext.observerGroundHeightMeters,
      moon,
      moonriseText: moonriseNoteText,
      moonsetText: moonsetNoteText,
      visibilitySummary,
    });
    try {
      await navigator.clipboard.writeText(body);
      setCopyStatus("copied");
      globalThis.setTimeout(() => {
        setCopyStatus("idle");
      }, 2200);
    } catch {
      setCopyStatus("error");
      globalThis.setTimeout(() => {
        setCopyStatus("idle");
      }, 3200);
    }
  }, [
    snapshotContext,
    showEphemeris,
    isMoonBelowHorizon,
    moon,
    moonriseNoteText,
    moonsetNoteText,
    visibilitySummary,
  ]);

  const showSnapshotButton =
    Boolean(snapshotContext) && showEphemeris && !isMoonBelowHorizon;

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
      {balconyIdealForTransitWatch ? (
        <div
          className="mb-2.5 rounded-md border border-yellow-400/45 bg-yellow-400/10 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          role="status"
          aria-live="polite"
          data-testid="moon-balcony-transit-watch-ideal"
        >
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-yellow-200/95">
            Ideal for transit watch
          </p>
          <p className="mt-1 text-[0.72rem] leading-snug text-yellow-100/90">
            Moon height, direction, and phase match the saved balcony reference — clear sight line; a good time to wait on a moon crossing.
          </p>
        </div>
      ) : null}
      <dl className="space-y-1 text-sm">
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
      {showSnapshotButton ? (
        <div className="mt-2.5 border-t border-zinc-800/70 pt-2.5">
          <button
            type="button"
            data-testid="moon-field-note-copy"
            onClick={() => {
              void copyFieldNote();
            }}
            className="mt-toolbar-btn flex w-full items-center justify-center gap-2 px-2 py-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[0.7rem] font-medium text-zinc-200 hover:border-blue-500/35"
            title="Copy observer position, simulation instant, and Moon geometry as plain text"
          >
            <SectionIconNote className="h-3.5 w-3.5 text-yellow-400/90" />
            Copy field note
          </button>
          {copyStatus === "copied" ? (
            <p
              className="mt-1.5 text-center text-[0.65rem] text-emerald-400/95"
              aria-live="polite"
            >
              Copied to clipboard
            </p>
          ) : null}
          {copyStatus === "error" ? (
            <p
              className="mt-1.5 text-center text-[0.65rem] text-amber-400/95"
              aria-live="polite"
            >
              Clipboard unavailable (try a secure HTTPS context)
            </p>
          ) : null}
        </div>
      ) : null}
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
