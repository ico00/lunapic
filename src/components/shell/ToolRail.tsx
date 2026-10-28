"use client";

import Link from "next/link";
import {
  PANELS_BY_GROUP,
  type PanelDef,
  type PanelId,
} from "@/components/shell/panelRegistry";
import { SectionIconQuestionMarkCircle } from "@/components/shell/sectionCategoryIcons";

/**
 * Desktop navigacija (spec §2b.5): lijevi izbornik s 12 panela u 5 grupa.
 * Svaka stavka ima ikonu i tekst; odabrana stavka je porculanska ploha.
 * Izbornik samo bira što ploča (`ToolSheet`) prikazuje, ne sadrži panele.
 */

const TOP_OFFSET = "calc(3.5rem + env(safe-area-inset-top))";

export function ToolRail({
  activeId,
  onSelect,
  badges,
  warnIds,
}: {
  activeId: PanelId | null;
  onSelect: (id: PanelId) => void;
  badges: Partial<Record<PanelId, number>>;
  warnIds?: Partial<Record<PanelId, boolean>>;
}) {
  return (
    <nav
      aria-label="Tools"
      className="pointer-events-auto absolute bottom-0 left-0 z-[16] flex w-[200px] flex-col gap-3.5 overflow-y-auto border-r border-[color:var(--hair)] bg-[color:var(--ground)] px-2 py-3"
      style={{ top: TOP_OFFSET }}
    >
      {PANELS_BY_GROUP.map((group) => (
        <section key={group.id} aria-label={group.label}>
          <h2 className="flex items-center gap-2 px-2 pb-1.5 text-[length:var(--fs-label)] font-bold uppercase tracking-[0.04em] text-[color:var(--ink-3)]">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full border-[2.5px]"
              style={{ borderColor: group.ink }}
            />
            {group.label}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {group.panels.map((item) => (
              <li key={item.id}>
                <RailButton
                  item={item}
                  open={activeId === item.id}
                  badge={badges[item.id]}
                  warn={warnIds?.[item.id] ?? false}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-auto border-t border-[color:var(--hair-soft)] pt-2">
        <Link
          href="/about"
          className="flex h-[38px] items-center gap-2.5 rounded-[var(--r-ctl)] px-2 text-[length:var(--fs-body)] font-medium text-[color:var(--ink-2)] transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel)] [@media(hover:hover)_and_(pointer:fine)]:hover:text-[color:var(--ink)]"
        >
          <SectionIconQuestionMarkCircle className="h-5 w-5" />
          About and help
        </Link>
      </div>
    </nav>
  );
}

function RailButton({
  item,
  open,
  badge,
  warn,
  onSelect,
}: {
  item: PanelDef;
  open: boolean;
  badge?: number;
  warn: boolean;
  onSelect: (id: PanelId) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-pressed={open}
      title={item.label}
      className={`relative flex h-[38px] w-full items-center gap-2.5 rounded-[var(--r-ctl)] px-2 text-left text-[length:var(--fs-body)] transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] ${
        open
          ? "bg-[color:var(--ink)] font-bold text-[color:var(--ground)]"
          : "font-medium text-[color:var(--ink-2)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel)] [@media(hover:hover)_and_(pointer:fine)]:hover:text-[color:var(--ink)]"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="min-w-0 flex-1 truncate">{item.railLabel}</span>
      {badge && badge > 0 ? (
        <span
          aria-label={`${badge} now`}
          className={`grid h-[22px] min-w-6 place-items-center rounded-full px-2 text-[length:var(--fs-label)] font-extrabold ${
            item.id === "active"
              ? "bg-[color:var(--disc)] text-[#1a0703]"
              : "bg-[color:var(--observer)] text-[#06143a]"
          }`}
        >
          {badge}
        </span>
      ) : warn ? (
        <span
          role="img"
          aria-label="Source unreachable"
          className="size-2.5 rounded-full bg-[color:var(--disc)]"
        />
      ) : null}
    </button>
  );
}

/**
 * Domaćin panela: sve ploče se otvaraju na istom mjestu desno od izbornika
 * (spec §2b.5), umjesto zasebnog ladičara s desne strane.
 */
export function ToolSheet({
  item,
  onClose,
  children,
}: {
  item: PanelDef;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={item.label}
      className={`pointer-events-auto absolute left-[216px] z-[15] flex flex-col overflow-hidden rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)] ${
        item.wide ? "w-[min(50vw,960px)]" : "w-[408px]"
      }`}
      style={{
        top: "calc(3.5rem + env(safe-area-inset-top) + 1rem)",
        maxHeight: "calc(100% - 3.5rem - env(safe-area-inset-top) - 1rem - 5.25rem)",
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--hair-soft)] px-4 py-3">
        <h2 className="mt-panel-title truncate">{item.label}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--panel-2)] text-[color:var(--ink-2)] transition-[border-color,transform] duration-150 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] [@media(hover:hover)_and_(pointer:fine)]:hover:border-[color:var(--ink-3)]"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]">
        {children}
      </div>
    </section>
  );
}
