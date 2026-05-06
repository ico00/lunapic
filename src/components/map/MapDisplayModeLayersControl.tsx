"use client";

import { useHasMounted } from "@/hooks/useHasMounted";
import { clampFloatingMenuLeft } from "@/lib/ui/clampFloatingMenuLeft";
import { FLIGHT_3D_MODEL_UI_PREVIEW_PATH } from "@/lib/map/mapOverlayConstants";
import { appPath } from "@/lib/paths/appPath";
import { shellComboboxListboxPortalClass } from "@/lib/ui/shellComboboxStyles";
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
    <div className="relative h-full w-full overflow-hidden bg-zinc-900" aria-hidden>
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
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950"
      aria-hidden
    >
      <div className="absolute h-14 w-14 max-md:h-8 max-md:w-8 rounded-full border-2 border-sky-400/35" />
      <div className="absolute h-9 w-9 max-md:h-5 max-md:w-5 rounded-full border-2 border-sky-200/45" />
      <div className="absolute h-2.5 w-2.5 max-md:h-1.5 max-md:w-1.5 rounded-full bg-sky-100/90 shadow-[0_0_12px_rgba(224,242,254,0.55)]" />
    </div>
  );
}

function previewForMode(mode: MapDisplayMode) {
  return mode === "atc" ? <PreviewAtcStyle /> : <Preview3DModel />;
}

/** Minijatura na gumbu = drugi mod (što dobiješ kad promijeniš prikaz), ne aktivni. */
function alternateMapDisplayMode(mode: MapDisplayMode): MapDisplayMode {
  return mode === "atc" ? "default" : "atc";
}

const OPTIONS: readonly { id: MapDisplayMode; label: string }[] = [
  { id: "default", label: "3D Model" },
  { id: "atc", label: "ATC Style" },
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
    const gap = 8;
    const w = Math.max(220, r.width * 2.15);
    const left = r.left;
    const estMenuHeightPx = 172;
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
        className={shellComboboxListboxPortalClass}
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: "min(50vh, 18rem)",
        }}
      >
        <div className="border-b border-zinc-700/80 px-2 py-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Aircraft display
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-1.5">
          {OPTIONS.map((opt) => {
            const active = mapDisplayMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => closeAndSet(opt.id)}
                className={`flex flex-col overflow-hidden rounded-md border text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/60 ${
                  active
                    ? "border-sky-500/70 bg-sky-950/50 ring-1 ring-sky-500/35"
                    : "border-zinc-700/80 bg-zinc-900/40 hover:border-zinc-500"
                }`}
                aria-pressed={active}
                data-testid={`map-display-mode-${opt.id}`}
                data-value={opt.id}
              >
                <div className="relative aspect-[4/3] w-full">{previewForMode(opt.id)}</div>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <span className="min-w-0 truncate text-xs font-semibold text-zinc-100">
                    {opt.label}
                  </span>
                  {active ? (
                    <span
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-zinc-950"
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
      <div className="pointer-events-none max-md:shrink-0 md:absolute md:bottom-3 md:left-3 md:z-10">
        <button
          ref={triggerRef}
          type="button"
          className="pointer-events-auto flex h-full min-h-0 w-[4.75rem] flex-col overflow-hidden rounded-xl border-2 border-white/90 bg-zinc-950 shadow-[0_10px_36px_rgba(0,0,0,0.45)] outline-none ring-1 ring-zinc-800/90 transition hover:border-sky-300/90 focus-visible:ring-2 focus-visible:ring-sky-500/50 active:scale-[0.98] md:h-auto"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? menuId : undefined}
          aria-label={`Switch aircraft map view. Currently ${mapDisplayMode === "atc" ? "ATC Style" : "3D Model"}; thumbnail previews the other option.`}
          data-testid="map-display-mode-layers-trigger"
          data-value={mapDisplayMode}
          onClick={() => setOpen((v) => !v)}
        >
          <div className="relative min-h-0 w-full flex-1 md:h-[4.5rem] md:flex-none">
            {previewForMode(alternateMapDisplayMode(mapDisplayMode))}
          </div>
          <div className="flex shrink-0 min-h-[1.35rem] items-center justify-center gap-1 bg-black/70 px-1 py-0.5 text-[10px] font-semibold leading-none tracking-wide text-white">
            <LayersStackIcon className="h-3.5 w-3.5 shrink-0 text-zinc-200" />
            <span className="truncate">Layers</span>
          </div>
        </button>
      </div>
      {popover && hasMounted ? createPortal(popover, document.body) : null}
    </>
  );
}
