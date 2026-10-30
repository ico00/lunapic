"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  MOBILE_EXTRA_PANELS,
  PANELS_BY_GROUP,
  PANEL_GROUPS,
  mobilePanelLabel,
  type MobilePanelId,
  type PanelGroupId,
} from "@/components/shell/panelRegistry";
import { SectionIconQuestionMarkCircle } from "@/components/shell/sectionCategoryIcons";

/**
 * Telefon (spec §2b.7): izbornik je donja traka s 5 grupa, a sve se otvara na
 * istom mjestu iznad nje. `null` znači da je vidljiva ploča "Next transit".
 */
export type MobileView = { group: PanelGroupId; panel: MobilePanelId | null } | null;

const PRESS =
  "transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]";

export function MobileTabBar({
  view,
  onSelect,
  alertGroups,
}: {
  view: MobileView;
  onSelect: (group: PanelGroupId) => void;
  alertGroups: Partial<Record<PanelGroupId, boolean>>;
}) {
  const current = view?.group ?? "now";
  return (
    <nav
      data-testid="mobile-primary-nav"
      aria-label="Tools"
      className="absolute inset-x-0 bottom-0 z-[60] grid grid-cols-5 border-t border-[color:var(--hair)] bg-[color:var(--ground)] px-1 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] pt-1.5"
    >
      {PANEL_GROUPS.map((group) => {
        const Icon = group.icon;
        const selected = current === group.id;
        return (
          <button
            key={group.id}
            type="button"
            data-testid={`mobile-shell-tab-${group.id}`}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(group.id)}
            className={`flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[var(--r-ctl)] text-[length:var(--fs-label)] font-semibold ${PRESS} ${
              selected ? "text-[color:var(--ink)]" : "text-[color:var(--ink-3)]"
            }`}
          >
            <span className="relative">
              <Icon className="h-[22px] w-[22px]" />
              {alertGroups[group.id] ? (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-0.5 size-[11px] rounded-full border-2 border-[color:var(--ground)] bg-[color:var(--disc)]"
                />
              ) : null}
            </span>
            {group.tabLabel}
          </button>
        );
      })}
    </nav>
  );
}

export function MobileGroupList({
  group,
  onOpen,
  badges,
  warnIds,
}: {
  group: PanelGroupId;
  onOpen: (id: MobilePanelId) => void;
  badges: Partial<Record<MobilePanelId, number>>;
  warnIds: Partial<Record<MobilePanelId, boolean>>;
}) {
  const panels = PANELS_BY_GROUP.find((g) => g.id === group)?.panels ?? [];
  const items = [...panels, ...MOBILE_EXTRA_PANELS.filter((p) => p.group === group)];
  return (
    <ul className="-mx-3 -my-1">
      {items.map((item) => {
        const Icon = item.icon;
        const badge = badges[item.id];
        return (
          <li key={item.id}>
            <button
              type="button"
              data-testid={`mobile-panel-row-${item.id}`}
              onClick={() => onOpen(item.id)}
              className={`flex min-h-[48px] w-full items-center gap-3 border-b border-[color:var(--hair-soft)] px-4 text-left text-[length:var(--fs-body)] font-semibold text-[color:var(--ink)] ${PRESS}`}
            >
              <Icon className="h-5 w-5 shrink-0 text-[color:var(--ink-2)]" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {badge && badge > 0 ? (
                <span className="grid h-[22px] min-w-6 place-items-center rounded-full bg-[color:var(--observer)] px-2 text-[length:var(--fs-label)] font-extrabold text-[#06143a]">
                  {badge}
                </span>
              ) : warnIds[item.id] ? (
                <span role="img" aria-label="Source unreachable" className="size-2.5 rounded-full bg-[color:var(--disc)]" />
              ) : null}
              <Chevron className="h-4 w-4 shrink-0 text-[color:var(--ink-3)]" />
            </button>
          </li>
        );
      })}
      {group === "plan" ? (
        <li>
          <Link
            href="/about"
            className={`flex min-h-[48px] items-center gap-3 px-4 text-[length:var(--fs-body)] font-medium text-[color:var(--ink-2)] ${PRESS}`}
          >
            <SectionIconQuestionMarkCircle className="h-5 w-5 shrink-0" />
            About and help
          </Link>
        </li>
      ) : null}
    </ul>
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
  const groupLabel = PANEL_GROUPS.find((g) => g.id === view.group)?.label ?? "";
  const title = view.panel ? mobilePanelLabel(view.panel) : groupLabel;
  // Popis grupe, vrijeme i legenda imaju par redaka, pa ne zauzimaju pola ekrana.
  const fullPanel = view.panel != null && view.panel !== "time" && view.panel !== "mapkey";
  const heightClass = fullPanel ? SNAP_HEIGHT[snap] : "";

  return (
    <section
      aria-label={title}
      className={`absolute inset-x-2 bottom-[var(--mobile-overlay-bottom)] z-[75] flex max-h-[78dvh] flex-col overflow-hidden rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)] transition-transform duration-150 ease-[var(--ease-ui)] motion-reduce:transition-none ${heightClass}`}
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
        {view.panel ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={`Back to ${groupLabel}`}
            className={`-ml-1 grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[var(--r-ctl)] text-[color:var(--ink-2)] ${PRESS}`}
          >
            <Chevron back className="h-5 w-5" />
          </button>
        ) : null}
        <h2 className="mt-panel-title min-w-0 flex-1 truncate">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="mt-btn mt-btn-sm shrink-0"
          aria-label="Close panel"
        >
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
