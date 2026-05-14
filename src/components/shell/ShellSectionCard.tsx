import { useId, type ReactNode, type ComponentPropsWithoutRef } from "react";

/** Boja gornje — vidljive linije / atmosfera sekcije (uskladi s paletom). */
export type ShellSectionAccent =
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "lime"
  | "zinc";

/**
 * Refresh v1: jača accent linija (vidljiviji "potpis" sekcije), čitljive labele
 * (≥ 90% boje, ne 75%). Glass podloga preko mt-app-bg-a — diše s atmosferom mape.
 */
const ACCENT_LINE: Record<ShellSectionAccent, string> = {
  sky: "from-sky-400/90 via-sky-400/30 to-transparent",
  emerald: "from-emerald-400/90 via-emerald-400/30 to-transparent",
  amber: "from-amber-400/90 via-amber-400/30 to-transparent",
  rose: "from-rose-400/85 via-rose-400/25 to-transparent",
  violet: "from-violet-400/85 via-violet-400/25 to-transparent",
  lime: "from-lime-400/85 via-lime-400/25 to-transparent",
  zinc: "from-zinc-400/65 to-transparent",
};

const ACCENT_BORDER: Record<ShellSectionAccent, string> = {
  sky: "border-sky-500/25 bg-sky-500/[0.05]",
  emerald: "border-emerald-500/25 bg-emerald-500/[0.05]",
  amber: "border-amber-500/22 bg-amber-500/[0.045]",
  rose: "border-rose-500/22 bg-rose-500/[0.05]",
  violet: "border-violet-500/22 bg-violet-500/[0.05]",
  lime: "border-lime-500/22 bg-lime-500/[0.05]",
  zinc: "border-white/[0.10] bg-white/[0.025]",
};

const ACCENT_LABEL: Record<ShellSectionAccent, string> = {
  sky: "text-sky-300 border-sky-500/[0.18]",
  emerald: "text-emerald-300 border-emerald-500/[0.18]",
  amber: "text-amber-300 border-amber-500/[0.16]",
  rose: "text-rose-300 border-rose-500/[0.16]",
  violet: "text-violet-300 border-violet-500/[0.16]",
  lime: "text-lime-300 border-lime-500/[0.16]",
  zinc: "text-zinc-300 border-white/[0.10]",
};

type SectionCardSurfaceProps = {
  accent?: ShellSectionAccent;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"section">, "className" | "children">;

/**
 * Isti vizualni omot kao `ShellSectionCard` (okvir, gradijent gore) bez naslova.
 * Za sadržaj koji nije `title + children` npr. `TimeSlider` u map headeru.
 */
export function SectionCardSurface({
  accent = "zinc",
  className = "",
  children,
  ...rest
}: SectionCardSurfaceProps) {
  return (
    <section
      className={`relative overflow-hidden rounded-[18px] border ${ACCENT_BORDER[accent]} p-4 shadow-[0_10px_32px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md ${className}`}
      {...rest}
    >
      <div
        className={`pointer-events-none absolute left-4 right-4 top-0 h-[1.5px] rounded-full bg-gradient-to-r ${ACCENT_LINE[accent]}`}
        aria-hidden
      />
      {children}
    </section>
  );
}

type ShellSectionCardProps = {
  title: string;
  /** Ikona pored naslova (npr. iz `sectionCategoryIcons`). */
  icon?: ReactNode;
  accent?: ShellSectionAccent;
  /** Naglašeni naslov (npr. Photographer). */
  titleTone?: "default" | "emerald";
  className?: string;
  children: React.ReactNode;
};

/**
 * Jedna logička cjelina u bočnoj traci / mobile decku — jasna granica u odnosu na "hrpu teksta".
 */
export function ShellSectionCard({
  title,
  icon,
  accent = "zinc",
  titleTone = "default",
  className = "",
  children,
}: ShellSectionCardProps) {
  const autoId = useId();
  const headingId = `shell-section-${autoId}`;

  const accentLabelClass = ACCENT_LABEL[accent];
  const labelClass =
    titleTone === "emerald"
      ? `mt-section-label-emerald border-b pb-2.5 ${accentLabelClass}`
      : `mt-section-label border-b pb-2.5 ${accentLabelClass}`;

  // Ikona u istoj boji kao labela (puna, ne 75%) — odmah jasno o čemu je sekcija.
  const iconClass = `opacity-90 ${ACCENT_LABEL[accent].split(" ")[0]}`;

  return (
    <SectionCardSurface
      accent={accent}
      className={className}
      aria-labelledby={headingId}
    >
      <h2
        id={headingId}
        className={`flex min-w-0 items-center gap-2.5 ${labelClass}`}
      >
        {icon ? (
          <span className={`shrink-0 ${iconClass}`} aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="min-w-0">{title}</span>
      </h2>
      <div className="mt-3 min-w-0">{children}</div>
    </SectionCardSurface>
  );
}

type ShellFootnoteProps = {
  children: React.ReactNode;
  className?: string;
};

/** Blaža, isprekidana kutija za kratke napomene ispod glavnih blokova. */
export function ShellFootnote({ children, className = "" }: ShellFootnoteProps) {
  return (
    <div
      className={`mt-3 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-3.5 py-3 text-[13px] leading-relaxed text-zinc-300/80 ${className}`}
    >
      {children}
    </div>
  );
}
