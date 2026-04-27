"use client";

import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconMoon } from "@/components/shell/sectionCategoryIcons";
import { useHasMounted } from "@/hooks/useHasMounted";
import { formatFixed } from "@/lib/format/numbers";
import type { MoonRiseSetKind, MoonState } from "@/types/moon";

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
          <dd className="font-mono tabular-nums">
            {display(formatFixed(moon.altitudeDeg))}°
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
    </ShellSectionCard>
  );
}
