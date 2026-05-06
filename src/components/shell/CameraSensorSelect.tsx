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
  CAMERA_SENSOR_ORDER,
  type CameraSensorType,
} from "@/lib/domain/geometry/shotFeasibility";
import { clampFloatingMenuLeft } from "@/lib/ui/clampFloatingMenuLeft";
import {
  shellComboboxListboxPortalClass,
  shellComboboxTriggerClass,
} from "@/lib/ui/shellComboboxStyles";

/** Puni naziv u otvorenom izborniku. */
function labelForSensor(id: CameraSensorType): string {
  if (id === "fullFrame") {
    return "Full Frame (1.0× crop)";
  }
  if (id === "apsC") {
    return "APS-C (1.5× crop)";
  }
  if (id === "apsC16") {
    return "APS-C (1.6× crop)";
  }
  return "Micro Four Thirds (2.0× crop)";
}

/** Kratki naziv na zatvorenom triggeru — bez skraćivanja. */
function triggerLabelForSensor(id: CameraSensorType): string {
  if (id === "fullFrame") {
    return "Full Frame";
  }
  if (id === "apsC") {
    return "APS-C 1.5×";
  }
  if (id === "apsC16") {
    return "APS-C 1.6×";
  }
  return "Micro 4/3";
}

type CameraSensorSelectProps = {
  value: CameraSensorType;
  onChange: (id: CameraSensorType) => void;
  /** When false, combobox reflects the preset and cannot be opened. */
  disabled?: boolean;
};

/**
 * Same combobox pattern as `FlightProviderSelect` (portal listbox, sky glass).
 */
export function CameraSensorSelect({
  value,
  onChange,
  disabled = false,
}: CameraSensorSelectProps) {
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
    if (!open || disabled) {
      return;
    }
    updatePosition();
  }, [open, disabled, updatePosition]);

  useEffect(() => {
    if (!disabled) {
      return;
    }
    const id = requestAnimationFrame(() => {
      setOpen(false);
    });
    return () => cancelAnimationFrame(id);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open || !pos) {
      return;
    }
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const w = menu.getBoundingClientRect().width;
    const nextLeft = clampFloatingMenuLeft(pos.left, w);
    if (Math.abs(nextLeft - pos.left) >= 1) {
      setPos((p) => (p ? { ...p, left: nextLeft } : null));
    }
  }, [open, pos]);

  useEffect(() => {
    if (!open) {
      return;
    }
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

  const onPick = (id: CameraSensorType) => {
    onChange(id);
    setOpen(false);
  };

  const listbox =
    !disabled && open && pos && hasMounted ? (
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
        {CAMERA_SENSOR_ORDER.map((id) => {
          const isSel = id === value;
          return (
            <li
              key={id}
              role="option"
              tabIndex={-1}
              aria-selected={isSel}
              className={
                isSel
                  ? "cursor-pointer select-none whitespace-nowrap rounded-md bg-blue-500/20 px-2.5 py-1.5 text-left text-sm text-yellow-400"
                  : "cursor-pointer select-none whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-200 outline-none hover:bg-zinc-800 hover:text-zinc-50 focus:bg-zinc-900"
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
              {labelForSensor(id)}
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
        disabled={disabled}
        data-testid="camera-sensor-select"
        data-value={value}
        className={
          disabled
            ? `${shellComboboxTriggerClass} cursor-not-allowed opacity-55`
            : shellComboboxTriggerClass
        }
        aria-label="Camera sensor type"
        aria-haspopup="listbox"
        aria-expanded={disabled ? false : open}
        aria-controls={disabled || !open ? undefined : listboxId}
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (disabled) {
            return;
          }
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!open) {
              setOpen(true);
            }
          }
        }}
      >
        <span className="min-w-0 flex-1 text-left">
          {triggerLabelForSensor(value)}
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
