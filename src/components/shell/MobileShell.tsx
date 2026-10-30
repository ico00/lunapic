"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  MOBILE_MORE_GROUPS,
  MOBILE_TAB_PANELS,
  PANEL_BY_ID,
  isMobileTabPanel,
  type PanelId,
} from "@/components/shell/panelRegistry";
import { SectionIconQuestionMarkCircle } from "@/components/shell/sectionCategoryIcons";

/**
 * Telefon (spec §2b.7): Active, Candidates, Photo i Moon su na jedan dodir, a
 * "More" otvara popis ostalih panela. `null` = vidljiva karta s trakama,
 * `"board"` = cijela ploča "Next transit".
 */
export type MobileView = PanelId | "more" | "board" | null;

const PRESS =
  "transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]";

export function MobileTabBar({
  view,
  onSelect,
  badges,
  warnMore,
}: {
  view: MobileView;
  onSelect: (id: PanelId | "more") => void;
  badges: Partial<Record<PanelId, number>>;
  warnMore: boolean;
}) {
  const moreSelected = view === "more" || (view != null && view !== "board" && !isMobileTabPanel(view));
  const tabClass = (selected: boolean) =>
    `flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[var(--r-ctl)] text-[length:var(--fs-label)] font-semibold ${PRESS} ${
      selected ? "bg-[color:var(--panel-2)] text-[color:var(--ink)]" : "text-[color:var(--ink-3)]"
    }`;
  return (
    <nav
      data-testid="mobile-primary-nav"
      aria-label="Tools"
      className="absolute inset-x-0 bottom-0 z-[60] grid grid-cols-5 gap-0.5 border-t border-[color:var(--hair)] bg-[color:var(--ground)] px-1 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] pt-1.5"
    >
      {MOBILE_TAB_PANELS.map((tab) => {
        const Icon = PANEL_BY_ID[tab.id].icon;
        const selected = view === tab.id;
        const badge = badges[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={`mobile-shell-tab-${tab.id}`}
            aria-current={selected ? "true" : undefined}
            aria-label={PANEL_BY_ID[tab.id].label}
            onClick={() => onSelect(tab.id)}
            className={tabClass(selected)}
          >
            <span className="relative">
              <Icon className="h-[22px] w-[22px]" />
              {badge && badge > 0 ? (
                <span
                  aria-hidden
                  className={`absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[length:var(--fs-label)] font-extrabold leading-none ${
                    tab.id === "active"
                      ? "bg-[color:var(--disc)] text-[#1a0703]"
                      : "bg-[color:var(--observer)] text-[#06143a]"
                  }`}
                >
                  {badge}
                </span>
              ) : null}
            </span>
            {tab.tabLabel}
          </button>
        );
      })}
      <button
        type="button"
        data-testid="mobile-shell-tab-more"
        aria-current={moreSelected ? "true" : undefined}
        aria-label="More tools"
        onClick={() => onSelect("more")}
        className={tabClass(moreSelected)}
      >
        <span className="relative">
          <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
          {warnMore ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-0.5 size-[11px] rounded-full border-2 border-[color:var(--ground)] bg-[color:var(--disc)]"
            />
          ) : null}
        </span>
        More
      </button>
    </nav>
  );
}

/** Svi paneli koji nisu na donjoj traci, po grupama izbornika. */
export function MobileMoreList({
  onOpen,
  warnIds,
}: {
  onOpen: (id: PanelId) => void;
  warnIds: Partial<Record<PanelId, boolean>>;
}) {
  return (
    <div className="-mx-3 -my-3">
      {MOBILE_MORE_GROUPS.map((group) => (
        <section key={group.id} aria-label={group.label}>
          <h3 className="flex items-center gap-2 px-4 pb-1 pt-3 text-[length:var(--fs-label)] font-bold uppercase tracking-[0.04em] text-[color:var(--ink-3)]">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full border-[2.5px]"
              style={{ borderColor: group.ink }}
            />
            {group.label}
          </h3>
          <ul>
            {group.panels.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid={`mobile-panel-row-${item.id}`}
                    onClick={() => onOpen(item.id)}
                    className={`flex min-h-[46px] w-full items-center gap-3 px-4 text-left text-[length:var(--fs-body)] font-semibold text-[color:var(--ink)] ${PRESS}`}
                  >
                    <Icon className="h-5 w-5 shrink-0 text-[color:var(--ink-2)]" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {warnIds[item.id] ? (
                      <span role="img" aria-label="Source unreachable" className="size-2.5 rounded-full bg-[color:var(--disc)]" />
                    ) : null}
                    <Chevron className="h-4 w-4 shrink-0 text-[color:var(--ink-3)]" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Link
        href="/about"
        className={`mt-1 flex min-h-[46px] items-center gap-3 border-t border-[color:var(--hair-soft)] px-4 text-[length:var(--fs-body)] font-medium text-[color:var(--ink-2)] ${PRESS}`}
      >
        <SectionIconQuestionMarkCircle className="h-5 w-5 shrink-0" />
        About and help
      </Link>
    </div>
  );
}

function Chevron({ className, back = false }: { className?: string; back?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={back ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

const SNAP_HEIGHT = { peek: "h-[44dvh]", half: "h-[60dvh]", full: "h-[78dvh]" } as const;

export function MobileSheet({
  view,
  onBack,
  onClose,
  children,
}: {
  view: NonNullable<MobileView>;
  onBack: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [snap, setSnap] = useState<keyof typeof SNAP_HEIGHT>("half");
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartYRef = useRef<number | null>(null);
  const title =
    view === "more" ? "More tools" : view === "board" ? "Next transit" : PANEL_BY_ID[view].label;
  const fullPanel = view !== "more";
  const showBack = view !== "more" && view !== "board" && !isMobileTabPanel(view);

  return (
    <section
      aria-label={title}
      className={`absolute inset-x-2 bottom-[var(--mobile-overlay-bottom)] z-[75] flex max-h-[78dvh] flex-col overflow-hidden rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)] transition-transform duration-150 ease-[var(--ease-ui)] motion-reduce:transition-none ${
        fullPanel ? SNAP_HEIGHT[snap] : ""
      }`}
      style={{ transform: `translateY(${Math.max(0, dragOffset)}px)` }}
    >
      <header
        className="relative flex shrink-0 items-center gap-2 border-b border-[color:var(--hair-soft)] px-3 pb-2.5 pt-4"
        onTouchStart={(e) => {
          touchStartYRef.current = e.touches[0]?.clientY ?? null;
          setDragOffset(0);
        }}
        onTouchMove={(e) => {
          if (touchStartYRef.current === null) return;
          const y = e.touches[0]?.clientY ?? touchStartYRef.current;
          setDragOffset(y - touchStartYRef.current);
        }}
        onTouchEnd={() => {
          if (dragOffset > 120) {
            if (!fullPanel || snap === "peek") onClose();
            else setSnap(snap === "full" ? "half" : "peek");
          } else if (dragOffset < -90) {
            setSnap(snap === "peek" ? "half" : "full");
          }
          touchStartYRef.current = null;
          setDragOffset(0);
        }}
      >
        {fullPanel ? (
          <button
            type="button"
            onClick={() => setSnap((prev) => (prev === "peek" ? "half" : prev === "half" ? "full" : "peek"))}
            className="absolute left-1/2 top-1.5 h-1 w-11 -translate-x-1/2 rounded-full bg-[color:var(--hair)]"
            aria-label="Adjust panel height"
          />
        ) : null}
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to more tools"
            className={`-ml-1 grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[var(--r-ctl)] text-[color:var(--ink-2)] ${PRESS}`}
          >
            <Chevron back className="h-5 w-5" />
          </button>
        ) : null}
        <h2 className="mt-panel-title min-w-0 flex-1 truncate">{title}</h2>
        <button type="button" onClick={onClose} className="mt-btn mt-btn-sm shrink-0" aria-label="Close panel">
          Done
        </button>
      </header>
      <div
        id="mobile-shell-sheet-panel"
        data-testid="mobile-deck-content"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-[color:var(--ink)] [scrollbar-gutter:stable]"
      >
        {children}
      </div>
    </section>
  );
}
