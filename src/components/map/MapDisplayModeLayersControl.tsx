"use client";

import { useHasMounted } from "@/hooks/useHasMounted";
import { clampFloatingMenuLeft } from "@/lib/ui/clampFloatingMenuLeft";
import { FLIGHT_3D_MODEL_UI_PREVIEW_PATH } from "@/lib/map/mapOverlayConstants";
import { appPath } from "@/lib/paths/appPath";
import {
  shellMapAircraftDisplayPopoverClass,
} from "@/lib/ui/shellComboboxStyles";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { MapDisplayMode } from "@/types/map-display";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

function LayersStackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5l7 4-7 4-7-4 7-4zm0 8.5l7 4-7 4-7-4 7-4z"
      />
    </svg>
  );
}

function Preview3DModel() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[color:var(--bg-2)]" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static preview; avoids next/image basePath coupling */}
      <img
        src={appPath(FLIGHT_3D_MODEL_UI_PREVIEW_PATH)}
        alt=""
        width={280}
        height={210}
        className="h-full w-full object-cover object-center"
        draggable={false}
      />
    </div>
  );
}

function PreviewAtcStyle() {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[color:var(--bg-1)] via-sky-950/40 to-[color:var(--bg-2)]"
      aria-hidden
    >
      <div className="absolute h-10 w-10 rounded-full border-2 border-sky-400/35" />
      <div className="absolute h-6 w-6 rounded-full border-2 border-sky-200/45" />
      <div className="absolute h-2 w-2 rounded-full bg-sky-100/90 shadow-[0_0_12px_rgba(224,242,254,0.55)]" />
    </div>
  );
}

function PreviewVfrStyle() {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0d1a0d]"
      aria-hidden
    >
      <div className="absolute h-11 w-11 rounded-full border-2 border-green-500/40" />
      <div className="absolute h-7 w-7 rounded-full border-2 border-amber-400/55" />
      <div className="absolute h-3.5 w-3.5 rounded-full border-[1.5px] border-cyan-400/65" />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-amber-400/90 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
      <div
        className="absolute inset-0 opacity-15"
        style={{
          background:
            "repeating-linear-gradient(35deg, transparent, transparent 12px, rgba(74,222,128,0.18) 12px, rgba(74,222,128,0.18) 13px)",
        }}
      />
    </div>
  );
}

function previewForMode(mode: MapDisplayMode) {
  if (mode === "atc") return <PreviewAtcStyle />;
  if (mode === "vfr") return <PreviewVfrStyle />;
  return <Preview3DModel />;
}

/** Minijatura na gumbu = sljedeći mod u ciklusu (default→atc→vfr→default). */
function alternateMapDisplayMode(mode: MapDisplayMode): MapDisplayMode {
  if (mode === "default") return "atc";
  if (mode === "atc") return "vfr";
  return "default";
}

const OPTIONS: readonly { id: MapDisplayMode; label: string }[] = [
  { id: "default", label: "3D" },
  { id: "atc", label: "ATC" },
  { id: "vfr", label: "VFR" },
] as const;

export function MapDisplayModeLayersControl() {
  const mapDisplayMode = useMoonTransitStore((s) => s.mapDisplayMode);
  const setMapDisplayMode = useMoonTransitStore((s) => s.setMapDisplayMode);
  const hasMounted = useHasMounted();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;
    const w = Math.max(260, r.width * 3.5);
    const left = r.left;
    const estMenuHeightPx = 136;
    const topAbove = r.top - gap - estMenuHeightPx;
    const placeAbove = topAbove >= 8;
    setMenuPos({
      top: placeAbove ? topAbove : r.bottom + gap,
      left,
      width: w,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPos();
  }, [open, updateMenuPos, mapDisplayMode]);

  useLayoutEffect(() => {
    if (!open || !menuPos) return;
    const menu = menuRef.current;
    if (!menu) return;
    const w = menu.getBoundingClientRect().width;
    const nextLeft = clampFloatingMenuLeft(menuPos.left, w);
    if (Math.abs(nextLeft - menuPos.left) >= 1) {
      setMenuPos((p) => (p ? { ...p, left: nextLeft } : null));
    }
  }, [open, menuPos]);

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
    window.addEventListener("resize", updateMenuPos);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", updateMenuPos);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, updateMenuPos]);

  const closeAndSet = (mode: MapDisplayMode) => {
    setMapDisplayMode(mode);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const popover =
    open && menuPos && hasMounted ? (
      <div
        ref={menuRef}
        id={menuId}
        role="dialog"
        aria-label="Map aircraft display mode"
        className={shellMapAircraftDisplayPopoverClass}
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: "min(50vh, 18rem)",
        }}
      >
        <div className="shrink-0 border-b border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)] px-3 py-2 font-[family-name:var(--font-jetbrains-mono)] text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-secondary)]">
          Aircraft display
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto p-2">
          {OPTIONS.map((opt) => {
            const active = mapDisplayMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => closeAndSet(opt.id)}
                className={`flex flex-col overflow-hidden rounded-[var(--r-md)] border text-left outline-none transition focus-visible:ring-2 focus-visible:ring-sky-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--glass-3)] ${
                  active
                    ? "border-sky-400/45 bg-sky-500/[0.12] ring-1 ring-sky-400/25"
                    : "border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)]/90 hover:border-sky-400/35 hover:bg-[color:var(--glass-2)]/80"
                }`}
                aria-pressed={active}
                data-testid={`map-display-mode-${opt.id}`}
                data-value={opt.id}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  {previewForMode(opt.id)}
                </div>
                <div className="flex items-center justify-between gap-1 border-t border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)]/70 px-2 py-2">
                  <span className="min-w-0 truncate text-[length:var(--fs-label)] font-semibold text-[color:var(--t-primary)]">
                    {opt.label}
                  </span>
                  {active ? (
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/90 text-[length:var(--fs-label)] font-bold leading-none text-[color:var(--bg-0)]"
                      aria-hidden
                    >
                      ✓
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="pointer-events-none max-md:shrink-0 md:absolute md:bottom-[4.5rem] md:left-3 md:z-10">
        <button
          ref={triggerRef}
          type="button"
          className="pointer-events-auto mt-glass-elevated flex h-full min-h-0 w-[4.75rem] flex-col overflow-hidden rounded-[var(--r-md)] outline-none transition hover:ring-1 hover:ring-sky-400/25 focus-visible:ring-2 focus-visible:ring-sky-500/45 active:scale-[0.98] md:h-auto"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? menuId : undefined}
          aria-label={`Switch aircraft map view. Currently ${mapDisplayMode === "atc" ? "ATC Style" : mapDisplayMode === "vfr" ? "VFR Map" : "3D Model"}; thumbnail previews the next option.`}
          data-testid="map-display-mode-layers-trigger"
          data-value={mapDisplayMode}
          onClick={() => setOpen((v) => !v)}
        >
          <div className="relative min-h-0 w-full flex-1 md:h-[4.5rem] md:flex-none">
            {previewForMode(alternateMapDisplayMode(mapDisplayMode))}
          </div>
          <div className="flex min-h-[1.35rem] shrink-0 items-center justify-center gap-1 border-t border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)] px-1 py-0.5 text-[length:var(--fs-label)] font-semibold leading-none tracking-wide text-[color:var(--t-secondary)]">
            <LayersStackIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--t-tertiary)]" />
            <span className="truncate">Layers</span>
          </div>
        </button>
      </div>
      {popover && hasMounted ? createPortal(popover, document.body) : null}
    </>
  );
}
