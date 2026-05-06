"use client";

import { ShellSectionCard } from "@/components/shell/ShellSectionCard";
import { SectionIconTarget } from "@/components/shell/sectionCategoryIcons";
import { useHasMounted } from "@/hooks/useHasMounted";
import { clampFloatingMenuLeft } from "@/lib/ui/clampFloatingMenuLeft";
import {
  shellAccentCheckboxClass,
  shellComboboxListboxPortalClass,
  shellComboboxTriggerClass,
} from "@/lib/ui/shellComboboxStyles";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

type FlightFiltersPanelProps = {
  searchQuery: string;
  onSearchQueryChange: (next: string) => void;
  aircraftTypeOptions: readonly string[];
  selectedAircraftTypes: readonly string[];
  onSelectedAircraftTypesChange: (next: readonly string[]) => void;
};

export function FlightFiltersPanel({
  searchQuery,
  onSearchQueryChange,
  aircraftTypeOptions,
  selectedAircraftTypes,
  onSelectedAircraftTypesChange,
}: FlightFiltersPanelProps) {
  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) + selectedAircraftTypes.length;
  const hasMounted = useHasMounted();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useLayoutEffect(() => {
    if (!open || !pos) return;
    const menu = menuRef.current;
    if (!menu) return;
    const w = menu.getBoundingClientRect().width;
    const nextLeft = clampFloatingMenuLeft(pos.left, w);
    if (Math.abs(nextLeft - pos.left) >= 1) {
      setPos((p) => (p ? { ...p, left: nextLeft } : null));
    }
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (
        t != null &&
        (menuRef.current?.contains(t) || triggerRef.current?.contains(t))
      ) {
        return;
      }
      setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, updatePosition]);

  const toggleType = (typeLabel: string, checked: boolean) => {
    if (checked) {
      if (selectedAircraftTypes.includes(typeLabel)) return;
      onSelectedAircraftTypesChange([...selectedAircraftTypes, typeLabel]);
      return;
    }
    onSelectedAircraftTypesChange(
      selectedAircraftTypes.filter((x) => x !== typeLabel)
    );
  };

  const triggerLabel =
    selectedAircraftTypes.length === 0
      ? "All aircraft types"
      : `${selectedAircraftTypes.length} selected`;

  const listbox =
    open && pos && hasMounted ? (
      <ul
        ref={menuRef}
        id={listboxId}
        role="listbox"
        aria-label="Aircraft type filter"
        className={shellComboboxListboxPortalClass}
        style={{
          top: pos.top,
          left: pos.left,
          minWidth: pos.width,
          width: "max-content",
          maxWidth: "min(calc(100vw - 1rem), 24rem)",
        }}
      >
        {aircraftTypeOptions.map((typeLabel) => {
          const checked = selectedAircraftTypes.includes(typeLabel);
          return (
            <li
              key={typeLabel}
              role="presentation"
              className={`cursor-pointer select-none rounded-md px-2.5 py-1.5 text-left text-sm outline-none ${
                checked
                  ? "bg-blue-500/20 text-yellow-400"
                  : "text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50"
              }`}
              onMouseDown={(e) => e.preventDefault()}
            >
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className={shellAccentCheckboxClass}
                  checked={checked}
                  onChange={(e) => toggleType(typeLabel, e.target.checked)}
                  data-testid={`flight-filter-type-${typeLabel}`}
                />
                <span className="min-w-0 flex-1 truncate">{typeLabel}</span>
              </label>
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <ShellSectionCard title="Filter" accent="violet" icon={<SectionIconTarget />}>
      <label className="block text-xs text-zinc-500">
        Search flights
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="callsign, airline, type, ICAO24..."
          className="mt-1 h-9 w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-2.5 text-sm text-zinc-100 outline-none ring-inset placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500/25"
          data-testid="flight-filter-search-input"
        />
      </label>
      <label className="mt-3 block text-xs text-zinc-500">
        Aircraft type (multi-select)
        <div className="mt-1">
          <button
            ref={triggerRef}
            type="button"
            className={shellComboboxTriggerClass}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            onClick={() => setOpen((v) => !v)}
            data-testid="flight-filter-types-select"
            data-value={triggerLabel}
          >
            <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
            <svg
              className={`h-4 w-4 shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      </label>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-xs text-zinc-400">
          Active filters: {activeFilterCount}
        </span>
        <button
          type="button"
          onClick={() => {
            onSearchQueryChange("");
            onSelectedAircraftTypesChange([]);
          }}
          className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
        >
          Clear all
        </button>
      </div>
      {listbox && hasMounted ? createPortal(listbox, document.body) : null}
    </ShellSectionCard>
  );
}

