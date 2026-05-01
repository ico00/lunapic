"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useHasMounted } from "@/hooks/useHasMounted";
import {
  FLIGHT_PROVIDER_IDS,
  type FlightProviderId,
} from "@/types/flight-provider";

function labelForProvider(id: FlightProviderId): string {
  if (id === "mock") {
    return "Mock";
  }
  if (id === "static") {
    return "Routes (static)";
  }
  return "OpenSky (ADS-B)";
}

type FlightProviderSelectProps = {
  value: FlightProviderId;
  onChange: (id: FlightProviderId) => void;
};

/**
 * Stilizirani combobox umjesto nativnog &lt;select&gt; (Shell kartica koristi
 * `overflow-hidden` — popis se iscrtava u portal da ne bude odsječen).
 */
export function FlightProviderSelect({
  value,
  onChange,
}: FlightProviderSelectProps) {
  const hasMounted = useHasMounted();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onScroll = () => {
      setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) {
        return;
      }
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

  const onPick = (id: FlightProviderId) => {
    onChange(id);
    setOpen(false);
  };

  const listbox =
    open && pos && hasMounted ? (
      <ul
        ref={menuRef}
        id={listboxId}
        role="listbox"
        className="fixed z-[280] m-0 max-h-60 list-none overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950/98 p-1 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-zinc-800 backdrop-blur-md"
        style={{
          top: pos.top,
          left: pos.left,
          width: pos.width,
        }}
      >
        {FLIGHT_PROVIDER_IDS.map((id) => {
          const isSel = id === value;
          return (
            <li
              key={id}
              role="option"
              tabIndex={-1}
              aria-selected={isSel}
              className={
                isSel
                  ? "cursor-pointer select-none rounded-md bg-blue-500/20 px-2.5 py-1.5 text-left text-sm text-yellow-400"
                  : "cursor-pointer select-none rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-200 outline-none hover:bg-zinc-800 hover:text-zinc-50 focus:bg-zinc-900"
              }
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(id);
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              {labelForProvider(id)}
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
        data-testid="flight-provider-select"
        data-value={value}
        className="inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-900/80 py-1.5 pl-2.5 pr-2 text-left text-sm text-zinc-200 shadow-inner outline-none ring-inset backdrop-blur-sm transition hover:border-blue-500/35 hover:bg-zinc-900 focus:ring-2 focus:ring-blue-500/25"
        aria-label="Flight data provider"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!open) {
              setOpen(true);
            }
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate">
          {labelForProvider(value)}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>
      {listbox && hasMounted
        ? createPortal(listbox, document.body)
        : null}
    </div>
  );
}
