"use client";

import { useMemo } from "react";
import { useHasMounted } from "@/hooks/useHasMounted";
import { moonFieldVisibilityAdvice } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { formatFixed } from "@/lib/format/numbers";
import { appPath } from "@/lib/paths/appPath";
import type { MoonRiseSetKind, MoonState } from "@/types/moon";

/**
 * Sažetak Mjeseca i uvjeta gore desno (spec §2b.8). Odgovara na pitanje
 * "vrijedi li večeras izaći": visina, faza, izlaz/zalaz i upozorenje o
 * oblacima, bez otvaranja panela.
 */

const CLOUD_WARN_PERCENT = 70;

const TIER_STYLE = {
  optimal: "border-[color:var(--live)] text-[color:var(--live)]",
  caution: "border-[color:var(--moon)] text-[color:var(--moon)]",
  critical: "border-[color:var(--disc)] text-[color:var(--disc-text)]",
} as const;

function clockLabel(t: Date | null, kind: MoonRiseSetKind): string {
  if (kind === "alwaysUp") return "Always up";
  if (kind === "alwaysDown") return "Never rises";
  if (!t) return "—";
  return t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Zasjenjeni dio diska: lit ≥ 50 % = polumjesec sjene, < 50 % = osvijetljeni polumjesec. */
function phaseShade(lit: number, waxing: boolean): React.CSSProperties {
  const clamped = Math.min(1, Math.max(0, lit));
  // Na sjevernoj hemisferi osvijetljen je desni rub kad raste, lijevi kad pada.
  const litSide = waxing ? 100 : 0;
  if (clamped >= 0.5) {
    const dark = (1 - clamped) * 100;
    return {
      background: "var(--ground-deep)",
      opacity: 0.9,
      clipPath: `ellipse(${dark}% 50% at ${100 - litSide}% 50%)`,
    };
  }
  const radius = clamped * 100;
  return {
    background: "var(--ground-deep)",
    opacity: 0.9,
    WebkitMaskImage: `radial-gradient(ellipse ${radius}% 50% at ${litSide}% 50%, transparent 97%, #000 100%)`,
    maskImage: `radial-gradient(ellipse ${radius}% 50% at ${litSide}% 50%, transparent 97%, #000 100%)`,
  };
}

export function MoonStrip({
  moon,
  moonRise,
  moonSet,
  moonRiseSetKind,
  showEphemeris,
  cloudCoverPercent,
}: {
  moon: MoonState;
  moonRise: Date | null;
  moonSet: Date | null;
  moonRiseSetKind: MoonRiseSetKind;
  showEphemeris: boolean;
  cloudCoverPercent: number | null;
}) {
  const mounted = useHasMounted();
  const ready = showEphemeris && mounted;
  const advice = ready ? moonFieldVisibilityAdvice(moon.altitudeDeg) : null;
  const lit = moon.illuminationFraction;
  const waxing = moon.phaseFraction < 0.5;
  const phaseName = useMemo(() => {
    const pct = Math.round(lit * 100);
    if (pct < 4) return "New moon";
    if (pct > 96) return "Full moon";
    const shape = pct >= 50 ? "gibbous" : "crescent";
    return `${waxing ? "Waxing" : "Waning"} ${shape}`;
  }, [lit, waxing]);
  const cloudy =
    cloudCoverPercent != null && cloudCoverPercent >= CLOUD_WARN_PERCENT;

  return (
    <aside
      aria-label="Moon and conditions"
      className="pointer-events-auto absolute right-3 z-[12] w-[312px] rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)] p-4"
      style={{ top: "calc(3.5rem + env(safe-area-inset-top) + 1rem)" }}
    >
      <div className="flex items-center gap-3.5">
        <div
          role="img"
          aria-label={ready ? `${phaseName}, ${Math.round(lit * 100)} percent lit` : "Moon"}
          className="relative size-[60px] shrink-0 overflow-hidden rounded-full bg-[color:var(--ground-deep)] bg-cover bg-center"
          style={{ backgroundImage: `url(${appPath("/moon-textures/nasa-full-moon.jpg")})` }}
        >
          {ready ? <div className="absolute inset-0" style={phaseShade(lit, waxing)} /> : null}
        </div>
        <div className="min-w-0">
          <h2 className="mt-panel-title">Moon now</h2>
          <p className="text-[length:var(--fs-meta)] text-[color:var(--ink-2)]">
            {ready ? `${phaseName} · ${Math.round(lit * 100)} % lit` : "—"}
          </p>
          {advice ? (
            <span
              className={`mt-1.5 inline-flex h-[22px] items-center rounded-full border-[1.5px] px-2 text-[length:var(--fs-label)] font-extrabold uppercase ${TIER_STYLE[advice.tier]}`}
            >
              {advice.label.split(" / ")[0]} · {formatFixed(moon.altitudeDeg, 1)}°
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4">
        <Stat label="Azimuth" value={ready ? `${formatFixed(moon.azimuthDeg, 1)}°` : "—"} />
        <Stat label="Altitude" value={ready ? `${formatFixed(moon.altitudeDeg, 1)}°` : "—"} />
        <Stat label="Moonrise" value={ready ? clockLabel(moonRise, moonRiseSetKind) : "—"} />
        <Stat label="Moonset" value={ready ? clockLabel(moonSet, moonRiseSetKind) : "—"} />
      </dl>

      {ready && advice && advice.tier !== "optimal" ? (
        <p
          role="status"
          className="mt-2 rounded-[var(--r-ctl)] border border-[color:var(--moon-line)] bg-[color:var(--moon-soft)] px-3 py-2.5 text-[length:var(--fs-meta)] text-[color:var(--ink)]"
        >
          <b className="font-extrabold">{advice.label}.</b> {advice.message}
        </p>
      ) : null}
      {ready && cloudy ? (
        <p
          role="status"
          className="mt-2 rounded-[var(--r-ctl)] border border-[color:var(--moon-line)] bg-[color:var(--moon-soft)] px-3 py-2.5 text-[length:var(--fs-meta)] text-[color:var(--ink)]"
        >
          <b className="font-extrabold">Clouds {Math.round(cloudCoverPercent ?? 0)} %.</b>{" "}
          The Moon is likely hidden even if the geometry works.
        </p>
      ) : null}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[color:var(--hair-soft)] py-1.5">
      <dt className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">{label}</dt>
      <dd className="text-[length:var(--fs-body)] font-extrabold text-[color:var(--ink)]">{value}</dd>
    </div>
  );
}
