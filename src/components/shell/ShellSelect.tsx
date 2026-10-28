"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { useHasMounted } from "@/hooks/useHasMounted";
import { clampFloatingMenuLeft } from "@/lib/ui/clampFloatingMenuLeft";
import {
  shellComboboxListboxPortalClass,
  shellComboboxOptionClass,
  shellComboboxTriggerClass,
} from "@/lib/ui/shellComboboxStyles";

export type ShellSelectOption = { readonly value: string; readonly label: string };

type ShellSelectProps = {
  value: string;
  options: readonly ShellSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  testId?: string;
};

/**
 * Generic combobox in the shell pattern (spec §4): trigger + chevron, portal
 * listbox at `z-[280]`, sky selection. Same behaviour as `CameraSensorSelect`,
 * for option lists that are data rather than a fixed enum.
 */
export function ShellSelect({ value, options, onChange, ariaLabel, testId }: ShellSelectProps) {
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
    if (open) updatePosition();
  }, [open, updatePosition]);

  useLayoutEffect(() => {
    if (!open || !pos) return;
    const menu = menuRef.current;
    if (!menu) return;
    const nextLeft = clampFloatingMenuLeft(pos.left, menu.getBoundingClientRect().width);
    if (Math.abs(nextLeft - pos.left) >= 1) setPos((p) => (p ? { ...p, left: nextLeft } : null));
  }, [open, pos]);

  // Scroll the selected option into view so a long list (time slots) opens on it.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t != null && (menuRef.current?.contains(t) || triggerRef.current?.contains(t))) return;
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

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  const listbox =
    open && pos && hasMounted ? (
      <ul
        ref={menuRef}
        id={listboxId}
        role="listbox"
        className={shellComboboxListboxPortalClass}
        style={{
          top: pos.top,
          left: pos.left,
          minWidth: pos.width,
          width: "max-content",
          maxWidth: "min(calc(100vw - 1rem), 22rem)",
        }}
      >
        {options.map((o) => {
          const isSel = o.value === value;
          return (
            <li
              key={o.value}
              role="option"
              tabIndex={-1}
              aria-selected={isSel}
              className={`${shellComboboxOptionClass(isSel)} whitespace-nowrap`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(o.value);
                }
              }}
            >
              {o.label}
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <div className="relative w-full min-w-0">
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        data-value={value}
        className={shellComboboxTriggerClass}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!open) setOpen(true);
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-[color:var(--t-tertiary)] transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {listbox ? createPortal(listbox, document.body) : null}
    </div>
  );
}
