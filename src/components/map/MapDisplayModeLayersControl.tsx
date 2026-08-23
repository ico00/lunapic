"use client";

import { FLIGHT_HISTORY_DAYS } from "@/hooks/useFlightHistoryLayers";
import { useHasMounted } from "@/hooks/useHasMounted";
import { clampFloatingMenuLeft } from "@/lib/ui/clampFloatingMenuLeft";
import { MAP_DISPLAY_MODE_ICON_PATHS } from "@/lib/map/mapOverlayConstants";
import { appPath } from "@/lib/paths/appPath";
import {
  shellGlassCheckboxClass,
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

/**
 * Pločica moda prikaza — ikona iz `public/images/icons/` centrirana na tamnoj
 * podlozi. Ikone nose vlastite boje (sky/indigo), pa se renderiraju kao `<img>`
 * umjesto `currentColor` SVG-a.
 */
function previewForMode(mode: MapDisplayMode) {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[color:var(--bg-2)]"
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static ikona; izbjegava next/image basePath spregu */}
      <img
        src={appPath(MAP_DISPLAY_MODE_ICON_PATHS[mode])}
        alt=""
        width={64}
        height={64}
        className="h-[58%] w-[58%] object-contain"
        draggable={false}
      />
    </div>
  );
}

const MODE_LABELS: Record<MapDisplayMode, string> = {
  default: "3D Model",
  "2d": "2D Flat",
  atc: "ATC Style",
  vfr: "VFR Map",
  streetview: "Street View",
};

const OPTIONS: readonly { id: MapDisplayMode; label: string }[] = [
  { id: "default", label: "3D" },
  { id: "2d", label: "2D" },
  { id: "atc", label: "ATC" },
  { id: "vfr", label: "VFR" },
  { id: "streetview", label: "Street View" },
] as const;

export function MapDisplayModeLayersControl() {
  const mapDisplayMode = useMoonTransitStore((s) => s.mapDisplayMode);
  const setMapDisplayMode = useMoonTransitStore((s) => s.setMapDisplayMode);
  const flightHistoryHeatmap = useMoonTransitStore((s) => s.flightHistoryHeatmap);
  const setFlightHistoryHeatmap = useMoonTransitStore((s) => s.setFlightHistoryHeatmap);
  const hourFilter = useMoonTransitStore((s) => s.flightHistoryHourFilter);
  const setHourFilter = useMoonTransitStore((s) => s.setFlightHistoryHourFilter);
  const flightHistoryRoutes = useMoonTransitStore((s) => s.flightHistoryRoutes);
  const setFlightHistoryRoutes = useMoonTransitStore((s) => s.setFlightHistoryRoutes);
  const airportRunwayOverlay = useMoonTransitStore((s) => s.airportRunwayOverlay);
  const setAirportRunwayOverlay = useMoonTransitStore((s) => s.setAirportRunwayOverlay);
  const transitCenterlineOverlay = useMoonTransitStore((s) => s.transitCenterlineOverlay);
  const setTransitCenterlineOverlay = useMoonTransitStore((s) => s.setTransitCenterlineOverlay);
  const hasMounted = useHasMounted();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    anchorTop: number;
    anchorBottom: number;
  } | null>(null);

  const GAP_PX = 10;
  const VIEWPORT_MARGIN_PX = 8;

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(360, r.width * 5.2);
    // Preliminary placement uses a height estimate; the post-render effect below
    // re-measures the actual menu height and corrects `top` so it never overlaps
    // the trigger or the controls to its right.
    const estMenuHeightPx = 136;
    const topAbove = r.top - GAP_PX - estMenuHeightPx;
    const placeAbove = topAbove >= VIEWPORT_MARGIN_PX;
    setMenuPos({
      top: placeAbove ? topAbove : r.bottom + GAP_PX,
      left: r.left,
      width: w,
      anchorTop: r.top,
      anchorBottom: r.bottom,
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
    const rect = menu.getBoundingClientRect();

    // Correct horizontal position against the measured width.
    const nextLeft = clampFloatingMenuLeft(menuPos.left, rect.width);

    // Correct vertical position against the measured height: prefer sitting fully
    // above the trigger, otherwise drop below it.
    const topAbove = menuPos.anchorTop - GAP_PX - rect.height;
    const nextTop =
      topAbove >= VIEWPORT_MARGIN_PX ? topAbove : menuPos.anchorBottom + GAP_PX;

    if (
      Math.abs(nextLeft - menuPos.left) >= 1 ||
      Math.abs(nextTop - menuPos.top) >= 1
    ) {
      setMenuPos((p) =>
        p ? { ...p, left: nextLeft, top: nextTop } : null,
      );
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

        {/*
          The toggles scroll; the mode tiles never shrink. Before this the tile
          grid was the only `flex-1 min-h-0` child, so every section added above
          it stole height until the tiles' `aspect-[4/3]` previews collapsed to
          zero and the row rendered as bare labels — reported 2026-08-23, once
          the centerline toggle pushed the popover past its 18rem cap.
        */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Flight history section */}
          <div className="shrink-0 border-b border-[color:var(--glass-stroke)] px-3 py-2">
            <div className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-secondary)]">
              Flight history
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-[length:var(--fs-label)] text-[color:var(--t-primary)]">
                  Density heatmap{" "}
                  <span className="text-[color:var(--t-tertiary)]">
                    ({FLIGHT_HISTORY_DAYS} days)
                  </span>
                </span>
                <input
                  type="checkbox"
                  className={shellGlassCheckboxClass}
                  checked={flightHistoryHeatmap}
                  onChange={(e) => setFlightHistoryHeatmap(e.target.checked)}
                  aria-label="Toggle flight history density heatmap"
                />
              </label>
              {flightHistoryHeatmap && (
                <div className="flex items-center justify-between gap-2 pl-3">
                  <span className="text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
                    Hours
                  </span>
                  <div className="flex items-center gap-1">
                    <select
                      value={hourFilter ? String(hourFilter.from) : "all"}
                      onChange={(e) => {
                        if (e.target.value === "all") { setHourFilter(null); return; }
                        const from = parseInt(e.target.value, 10);
                        setHourFilter({ from, to: hourFilter?.to ?? (from + 6) % 24 });
                      }}
                      aria-label="Heatmap hour window start"
                      className="rounded-[var(--r-sm)] border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)] px-1.5 py-0.5 text-[length:var(--fs-label)] text-[color:var(--t-primary)] outline-none focus-visible:ring-1 focus-visible:ring-sky-400/40"
                    >
                      <option value="all">All</option>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>
                      ))}
                    </select>
                    {hourFilter && (
                      <>
                        <span className="text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">–</span>
                        <select
                          value={String(hourFilter.to)}
                          onChange={(e) =>
                            setHourFilter({ from: hourFilter.from, to: parseInt(e.target.value, 10) })
                          }
                          aria-label="Heatmap hour window end"
                          className="rounded-[var(--r-sm)] border border-[color:var(--glass-stroke)] bg-[color:var(--glass-1)] px-1.5 py-0.5 text-[length:var(--fs-label)] text-[color:var(--t-primary)] outline-none focus-visible:ring-1 focus-visible:ring-sky-400/40"
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </div>
              )}
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-[length:var(--fs-label)] text-[color:var(--t-primary)]">
                  Route lines{" "}
                  <span className="text-[color:var(--t-tertiary)]">
                    ({FLIGHT_HISTORY_DAYS} days)
                  </span>
                </span>
                <input
                  type="checkbox"
                  className={shellGlassCheckboxClass}
                  checked={flightHistoryRoutes}
                  onChange={(e) => setFlightHistoryRoutes(e.target.checked)}
                  aria-label="Toggle flight history route lines"
                />
              </label>
            </div>
          </div>

          {/* Static reference overlays — two per row, so another toggle here costs
              no height at all (see the scroll note above). */}
          <div className="shrink-0 border-b border-[color:var(--glass-stroke)] px-3 py-2">
            <div className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-secondary)]">
              Reference
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <label className="flex cursor-pointer items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[length:var(--fs-label)] text-[color:var(--t-primary)]">
                  LDZA runway{" "}
                  <span className="text-[color:var(--t-tertiary)]">04/22</span>
                </span>
                <input
                  type="checkbox"
                  className={shellGlassCheckboxClass}
                  checked={airportRunwayOverlay}
                  onChange={(e) => setAirportRunwayOverlay(e.target.checked)}
                  aria-label="Toggle Zagreb Airport runway reference line"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[length:var(--fs-label)] text-[color:var(--t-primary)]">
                  Stand-here line{" "}
                  <span className="text-[color:var(--t-tertiary)]">(selected)</span>
                </span>
                <input
                  type="checkbox"
                  className={shellGlassCheckboxClass}
                  checked={transitCenterlineOverlay}
                  onChange={(e) => setTransitCenterlineOverlay(e.target.checked)}
                  aria-label="Toggle the stand-here centerline for the selected aircraft"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-5 gap-2 p-2">
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
          aria-label={`Switch aircraft map view. Currently ${MODE_LABELS[mapDisplayMode]}.`}
          data-testid="map-display-mode-layers-trigger"
          data-value={mapDisplayMode}
          onClick={() => setOpen((v) => !v)}
        >
          <div className="relative min-h-0 w-full flex-1 md:h-[4.5rem] md:flex-none">
            {previewForMode(mapDisplayMode)}
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
