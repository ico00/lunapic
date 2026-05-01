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

const ACCENT_LINE: Record<ShellSectionAccent, string> = {
  sky: "from-blue-500/70 via-blue-400/15 to-transparent",
  emerald: "from-yellow-500/65 via-yellow-400/12 to-transparent",
  amber: "from-yellow-500/55 via-yellow-500/10 to-transparent",
  rose: "from-zinc-500/50 via-zinc-600/12 to-transparent",
  violet: "from-blue-600/50 via-blue-500/12 to-transparent",
  lime: "from-yellow-400/55 via-yellow-400/10 to-transparent",
  zinc: "from-zinc-500/45 to-transparent",
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
      className={`relative overflow-hidden rounded-md border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-black p-3.5 shadow-[0_10px_36px_-12px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-zinc-800/80 ${className}`}
      {...rest}
    >
      <div
        className={`pointer-events-none absolute left-4 right-4 top-0 h-px rounded-full bg-gradient-to-r ${ACCENT_LINE[accent]}`}
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

  const labelClass =
    titleTone === "emerald"
      ? "mt-section-label-emerald border-b border-white/[0.07] pb-2.5"
      : "mt-section-label border-b border-white/[0.07] pb-2.5";

  const iconClass = "text-yellow-400/90";

  return (
    <SectionCardSurface
      accent={accent}
      className={className}
      aria-labelledby={headingId}
    >
      <h2
        id={headingId}
        className={`flex min-w-0 items-center gap-2 ${labelClass}`}
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
      className={`mt-3 rounded-md border border-dashed border-zinc-700 bg-zinc-950/50 px-3 py-2.5 font-[family-name:var(--font-jetbrains-mono)] text-xs leading-relaxed text-zinc-500 ${className}`}
    >
      {children}
    </div>
  );
}
