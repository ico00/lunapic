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
import { CAMERA_PRESETS } from "@/lib/camera/cameraPresets";
import { clampFloatingMenuLeft } from "@/lib/ui/clampFloatingMenuLeft";
import {
  shellComboboxListboxPortalClass,
  shellComboboxTriggerClass,
} from "@/lib/ui/shellComboboxStyles";

type CameraPresetSelectProps = {
  value: string;
  onChange: (id: string) => void;
};

function triggerLabel(value: string): string {
  return CAMERA_PRESETS.find((p) => p.id === value)?.label ?? "Camera";
}

export function CameraPresetSelect({ value, onChange }: CameraPresetSelectProps) {
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

  const onPick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

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
        {CAMERA_PRESETS.map((preset) => {
          const isSel = preset.id === value;
          return (
            <li
              key={preset.id}
              role="option"
              tabIndex={-1}
              aria-selected={isSel}
              className={
                isSel
                  ? "cursor-pointer select-none whitespace-nowrap rounded-md bg-blue-500/20 px-2.5 py-1.5 text-left text-sm text-yellow-400"
                  : "cursor-pointer select-none whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-200 outline-none hover:bg-zinc-800 hover:text-zinc-50 focus:bg-zinc-900"
              }
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(preset.id)}
            >
              {preset.label}
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
        data-testid="camera-preset-select"
        data-value={value}
        className={shellComboboxTriggerClass}
        aria-label="Camera preset"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <span className="min-w-0 flex-1 text-left">{triggerLabel(value)}</span>
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
      {listbox && hasMounted ? createPortal(listbox, document.body) : null}
    </div>
  );
}
