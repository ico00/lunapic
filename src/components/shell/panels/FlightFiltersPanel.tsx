"use client";

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
              className={`cursor-pointer select-none rounded-xl px-2.5 py-1.5 text-left text-sm outline-none ${
                checked
                  ? "bg-violet-500/15 text-violet-200"
                  : "text-zinc-200 hover:bg-zinc-800/70 hover:text-zinc-50"
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
    <div>
      <label className="block text-[length:var(--fs-meta)] font-medium text-[color:var(--t-secondary)]">
        Search flights
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="callsign, airline, type, ICAO24..."
          className="mt-1.5 h-11 w-full rounded-2xl border border-white/[0.10] bg-white/[0.04] px-3.5 text-[16px] text-zinc-100 outline-none ring-inset placeholder:text-zinc-500 focus:ring-2 focus:ring-violet-500/35"
          data-testid="flight-filter-search-input"
        />
      </label>
      <label className="mt-3.5 block text-[length:var(--fs-meta)] font-medium text-[color:var(--t-secondary)]">
        Aircraft type (multi-select)
        <div className="mt-1.5">
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
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[length:var(--fs-meta)] text-[color:var(--t-tertiary)]">
          Active filters: <strong className="font-semibold text-[color:var(--t-primary)]">{activeFilterCount}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            onSearchQueryChange("");
            onSelectedAircraftTypesChange([]);
          }}
          className="h-9 rounded-full border border-white/[0.10] bg-white/[0.05] px-4 text-[length:var(--fs-meta)] font-semibold text-[color:var(--t-secondary)] transition hover:border-white/[0.20] hover:bg-white/[0.10]"
        >
          Clear all
        </button>
      </div>
      {listbox && hasMounted ? createPortal(listbox, document.body) : null}
    </div>
  );
}

