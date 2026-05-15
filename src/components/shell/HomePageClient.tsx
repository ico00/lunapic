"use client";

import { ArSkyCameraPanel } from "@/components/field/ArSkyCameraPanel";
import { CompassAimPanel } from "@/components/field/CompassAimPanel";
import { FieldOverlaysSection } from "@/components/field/FieldOverlaysSection";
import { AddToHomeScreenPrompt } from "@/components/shell/AddToHomeScreenPrompt";
import { GoldenAlignmentFlash } from "@/components/shell/GoldenAlignmentFlash";
import { ActiveTransitsPanel } from "@/components/shell/panels/ActiveTransitsPanel";
import { FlightFiltersPanel } from "@/components/shell/panels/FlightFiltersPanel";
import { FlightSourcePanel } from "@/components/shell/panels/FlightSourcePanel";
import { MoonEphemerisPanel } from "@/components/shell/panels/MoonEphemerisPanel";
import { ObserverLocationPanel } from "@/components/shell/panels/ObserverLocationPanel";
import { PhotographerToolsPanel } from "@/components/shell/panels/PhotographerToolsPanel";
import { TimeSliderPanel } from "@/components/shell/panels/TimeSliderPanel";
import { TransitCandidatesPanel } from "@/components/shell/panels/TransitCandidatesPanel";
import { StreetViewFullscreen } from "@/components/map/StreetViewFullscreen";
import { WeatherOverlay } from "@/components/weather/WeatherOverlay";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useHomeShellOrchestration } from "@/hooks/useHomeShellOrchestration";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { useTransitCandidateNotifications } from "@/hooks/useTransitCandidateNotifications";
import { useFlightAircraftTypeIndexPrefetch } from "@/hooks/useFlightAircraftTypeIndexPrefetch";
import { useAstronomySync } from "@/hooks/useAstronomySync";
import { useWeatherSync } from "@/hooks/useWeatherSync";
import {
  SectionIconAR,
  SectionIconCamera,
  SectionIconArrowUpCircle,
  SectionIconField,
  SectionIconFlightSource,
  SectionIconMoon,
  SectionIconObserver,
  SectionIconArrowsRightLeft,
  SectionIconFunnel,
  SectionIconTime,
  SectionIconPaperAirplane,
  SectionIconQuestionMarkCircle,
} from "@/components/shell/sectionCategoryIcons";
import { resumeSharedAudioFromUserGesture } from "@/lib/audio/fieldAudio";
import { appPath } from "@/lib/paths/appPath";
import { formatFixed } from "@/lib/format/numbers";
import {
  type FlightFilterCriteria,
  uniqueAircraftTypeFilterOptions,
  filterFlightsByCriteria,
} from "@/lib/flight/flightSearch";
import { useObserverStore } from "@/stores/observer-store";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { MapContainerProps } from "@/components/map/MapContainer";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* =============================================================================
   v2 — Map-first command center
   - Mapa zauzima cijeli viewport (z-0).
   - Sve UI klizi PREKO mape kao floating glass elementi.
   - Desktop: brand pilula gore lijevo, ⌘K cmd bar centar, weather+akcije desno;
              right rail strip s ikonama → klik proširuje u drawer s panelom.
   - Mobile: brand pilula + status chip "Mjesec sada", time ribbon, dock s 4
             kontekstualne pilule (Active/Tracks/Moon/Photo) + "More" overlay.
   - Time ribbon dolje umotava postojeći TimeSliderPanel u novo glass kućište.
   - Incoming transit alert klizi iz dolnjeg desnog ugla kad active > 0.
   ========================================================================= */

const MapContainer = dynamic<MapContainerProps>(
  () => import("@/components/map/MapContainer").then((m) => m.MapContainer),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="map-loading"
        className="mt-map-loading h-full w-full"
        aria-label="Map loading"
      />
    ),
  }
);

/* ---------------- Brand pilula --------------------------------------------- */

function BrandPill({ size = "default" }: { size?: "default" | "compact" }) {
  const isCompact = size === "compact";
  return (
    <button
      type="button"
      aria-label="Refresh page"
      title="Refresh page"
      data-testid="header-logo-refresh"
      onClick={() => {
        globalThis.location.reload();
      }}
      className={`mt-glass-elevated pointer-events-auto inline-flex shrink-0 items-center gap-2.5 rounded-full px-3 py-1.5 transition active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/75 ${
        isCompact ? "max-w-[min(70vw,12rem)]" : ""
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={appPath("/logo.png")}
        alt=""
        width={isCompact ? 28 : 32}
        height={isCompact ? 28 : 32}
        decoding="async"
        fetchPriority="high"
        className={
          isCompact
            ? "h-7 w-auto max-w-7 object-contain"
            : "h-8 w-auto max-w-8 object-contain"
        }
      />
      <span
        className={`mt-title shrink-0 leading-none tracking-tight ${
          isCompact ? "text-[15px]" : "text-base"
        }`}
      >
        LunaPic
      </span>
    </button>
  );
}

/* ---------------- Search bar (search-as-you-type) -------------------------- */

function CommandBar({
  query,
  onChange,
  resultCount,
  widthClass = "w-[min(420px,42vw)]",
}: {
  query: string;
  onChange: (q: string) => void;
  resultCount: number | null;
  /** Tailwind width class — desktop default, mobile prosljeđuje `w-full`. */
  widthClass?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = query.length > 0;

  /** Cmd+K (Mac) / Ctrl+K (Win) → fokus search; Esc → blur i clear. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (
        e.key === "Escape" &&
        document.activeElement === inputRef.current
      ) {
        e.preventDefault();
        if (query.length > 0) onChange("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onChange, query.length]);

  return (
    <div className={`mt-glass-elevated pointer-events-auto flex h-11 items-center gap-2.5 rounded-full px-3.5 transition focus-within:border-white/[0.22] focus-within:ring-1 focus-within:ring-sky-500/30 ${widthClass}`}>
      <svg
        className="h-[17px] w-[17px] shrink-0 cursor-pointer text-zinc-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        onClick={() => inputRef.current?.focus()}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search…"
        aria-label="Search flights"
        className="flex-1 min-w-0 bg-transparent text-[16px] text-zinc-100 outline-none placeholder:text-zinc-500"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {hasQuery && resultCount !== null && (
        <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
          {resultCount}
        </span>
      )}
      {hasQuery ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="shrink-0 rounded-full p-0.5 text-zinc-500 transition hover:text-zinc-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <span className="hidden shrink-0 rounded-md border border-white/[0.10] bg-white/[0.04] px-1.5 py-[2px] font-mono text-[11px] text-zinc-500 md:inline-block">
          ⌘K
        </span>
      )}
    </div>
  );
}

/* ---------------- Weather + actions (top right) ---------------------------- */

function TopRightCluster({
  onPlace,
  onFocus,
  observerLocked,
}: {
  onPlace: () => void;
  onFocus: () => void;
  observerLocked: boolean;
}) {
  return (
    <div className="pointer-events-auto flex shrink-0 items-center gap-2.5">
      <div className="mt-glass-elevated flex h-11 shrink-0 items-center gap-2.5 rounded-full px-3.5">
        <WeatherOverlay />
      </div>
      <button
        type="button"
        onClick={onPlace}
        disabled={observerLocked}
        title="Set my location here"
        aria-label="Set my location here — current view center becomes observer"
        className="mt-glass-elevated grid h-11 w-11 place-items-center rounded-full text-amber-300 transition hover:border-amber-400/50 hover:bg-amber-500/10 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500/75 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg
          className="h-[18px] w-[18px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 22s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onFocus}
        title="Focus on me"
        aria-label="Focus on me — pan map to observer"
        className="mt-glass-elevated grid h-11 w-11 place-items-center rounded-full text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/10 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/75"
      >
        <svg
          className="h-[18px] w-[18px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      </button>
    </div>
  );
}

/* ---------------- Right rail (desktop) ------------------------------------- */

type RailItemId =
  | "active"
  | "moon"
  | "candidates"
  | "photo"
  | "compass"
  | "field"
  | "observer"
  | "flight"
  | "filters"
  | "ar";

type RailItem = {
  readonly id: RailItemId;
  readonly label: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly accent: "moon" | "sky" | "mint" | "rose" | "violet";
};

const RAIL_ITEMS: readonly RailItem[] = [
  { id: "active", label: "Active transits", icon: SectionIconPaperAirplane, accent: "moon" },
  { id: "candidates", label: "Transit candidates", icon: SectionIconArrowsRightLeft, accent: "sky" },
  { id: "photo", label: "Photographer", icon: SectionIconCamera, accent: "mint" },
  { id: "filters", label: "Flight filters", icon: SectionIconFunnel, accent: "violet" },
  { id: "moon", label: "Moon (nowcast)", icon: SectionIconMoon, accent: "moon" },
  { id: "observer", label: "Observer", icon: SectionIconObserver, accent: "moon" },
  { id: "ar", label: "AR sky overlay", icon: SectionIconAR, accent: "sky" },
  { id: "compass", label: "Compass → Moon", icon: SectionIconArrowUpCircle, accent: "rose" },
  { id: "flight", label: "Flight source", icon: SectionIconFlightSource, accent: "violet" },
  { id: "field", label: "Field overlays", icon: SectionIconField, accent: "mint" },
];

const ACCENT_BTN: Record<RailItem["accent"], string> = {
  moon: "border-amber-400/35 bg-amber-500/[0.12] text-amber-300",
  sky: "border-sky-400/35 bg-sky-500/[0.12] text-sky-300",
  mint: "border-emerald-400/35 bg-emerald-500/[0.12] text-emerald-300",
  rose: "border-rose-400/35 bg-rose-500/[0.12] text-rose-300",
  violet: "border-violet-400/35 bg-violet-500/[0.12] text-violet-300",
};

const ACCENT_ICON: Record<RailItem["accent"], string> = {
  moon:   "text-amber-300",
  sky:    "text-sky-300",
  mint:   "text-emerald-300",
  rose:   "text-rose-300",
  violet: "text-violet-300",
};

function FloatingRail({
  expandedId,
  onSelect,
  onClose,
  badges,
  children,
}: {
  expandedId: RailItemId | null;
  onSelect: (id: RailItemId) => void;
  onClose: () => void;
  badges: Partial<Record<RailItemId, number>>;
  children: React.ReactNode;
}) {
  const expanded = expandedId !== null;
  const item = RAIL_ITEMS.find((r) => r.id === expandedId);

  return (
    <aside
      aria-label="Tools"
      className={`mt-glass-elevated pointer-events-auto absolute right-3 top-[5.5rem] z-[15] flex overflow-hidden rounded-3xl transition-[width] duration-300 ease-[cubic-bezier(0.2,0.9,0.2,1.06)] ${
        expanded
          ? "bottom-[8.5rem] w-[420px]"
          : "h-fit max-h-[calc(100dvh-5.5rem-8.5rem)] w-[72px] overflow-y-auto"
      }`}
    >
      {/* Strip s ikonama */}
      <nav
        aria-label="Tool strip"
        className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 px-2 py-3"
      >
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const isOpen = expandedId === item.id;
          const badge = badges[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-pressed={isOpen}
              aria-label={item.label}
              title={item.label}
              className={`relative grid h-12 w-12 place-items-center rounded-2xl border transition active:scale-[0.96] ${
                isOpen
                  ? `${ACCENT_BTN[item.accent]} shadow-[0_0_24px_-8px_rgba(96,165,250,0.55)]`
                  : "border-transparent text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
              }`}
            >
              <Icon className={`h-[22px] w-[22px] ${
                isOpen ? ACCENT_ICON[item.accent] : `${ACCENT_ICON[item.accent]} opacity-50`
              }`} />
              {badge && badge > 0 ? (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-amber-400 px-1 font-mono text-[10px] font-bold leading-[18px] text-zinc-900"
                >
                  {badge}
                </span>
              ) : null}
              {isOpen ? (
                <span
                  aria-hidden
                  className="absolute -left-[10px] top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-current shadow-[0_0_8px_currentColor]"
                />
              ) : null}
            </button>
          );
        })}
        <div className="mt-1 flex w-full flex-col items-center border-t border-white/[0.08] pt-2">
          <Link
            href="/about"
            title="About and usage guide"
            aria-label="About and usage guide"
            className="relative grid h-12 w-12 place-items-center rounded-2xl border border-transparent text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/75"
          >
            <SectionIconQuestionMarkCircle className="h-[22px] w-[22px] text-sky-300/90 opacity-80 hover:opacity-100" />
          </Link>
        </div>
      </nav>

      {/* Drawer s panelom */}
      {expanded && item ? (
        <div className="flex min-w-0 flex-1 flex-col border-l border-white/[0.08]">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] px-4 py-3.5">
            <h2 className="mt-panel-title flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full shadow-[0_0_10px_currentColor] ${
                  ACCENT_BTN[item.accent].split(" ").find((c) => c.startsWith("text-")) ?? "text-zinc-300"
                }`}
              />
              <span className="truncate">{item.label}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.10] bg-white/[0.04] text-zinc-300 transition hover:border-white/[0.20] hover:bg-white/[0.08]"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-gutter:stable]">
            {children}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

/* ---------------- Time ribbon (bottom) ------------------------------------- */

function TimeRibbon(props: {
  referenceEpochMs: number;
  offsetHours: number;
  onSlider: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showEphemeris: boolean;
  isMoonBelowHorizon: boolean;
  sliderWidthHours: number;
  timeSliderStartLabel: string;
  timeSliderEndLabel: string;
  timeSliderMode: "forward24h";
  syncTime: () => void;
  compact?: boolean;
}) {
  if (props.compact) {
    // Mobile slim ribbon — tanka pilula 44px s [time | slider | offset | sync ikona]
    return (
      <div className="mt-glass-elevated pointer-events-auto absolute z-[14] left-2 right-2 bottom-[calc(5rem+env(safe-area-inset-bottom))] flex h-11 items-center gap-2 rounded-full px-3.5">
        <div className="min-w-0 flex-1">
          <TimeSliderPanel
            variant="mapChip"
            hideHeading
            referenceEpochMs={props.referenceEpochMs}
            offsetHours={props.offsetHours}
            onOffsetHoursChange={props.onSlider}
            showEphemeris={props.showEphemeris}
            isMoonBelowHorizon={props.isMoonBelowHorizon}
            sliderMaxHours={props.sliderWidthHours}
            timeSliderStartLabel={props.timeSliderStartLabel}
            timeSliderEndLabel={props.timeSliderEndLabel}
            timeSliderMode={props.timeSliderMode}
          />
        </div>
        <button
          type="button"
          onClick={props.syncTime}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-500/35 bg-emerald-500/[0.10] text-emerald-300 transition hover:border-emerald-400/55 hover:bg-emerald-500/[0.18] active:scale-[0.95]"
          title="Sync time to now"
          aria-label="Sync time to now"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 12a9 9 0 1 1-3.5-7.1" />
            <path d="M21 4v5h-5" />
          </svg>
        </button>
      </div>
    );
  }
  // Desktop slim ribbon — ista filozofija kao mobile, samo malo veće (h-12).
  return (
    <div className="mt-glass-elevated pointer-events-auto absolute z-[14] left-3 right-[5.5rem] bottom-3 flex h-12 items-center gap-3 rounded-full px-4">
      <div className="min-w-0 flex-1">
        <TimeSliderPanel
          variant="mapChip"
          hideHeading
          referenceEpochMs={props.referenceEpochMs}
          offsetHours={props.offsetHours}
          onOffsetHoursChange={props.onSlider}
          showEphemeris={props.showEphemeris}
          isMoonBelowHorizon={props.isMoonBelowHorizon}
          sliderMaxHours={props.sliderWidthHours}
          timeSliderStartLabel={props.timeSliderStartLabel}
          timeSliderEndLabel={props.timeSliderEndLabel}
          timeSliderMode={props.timeSliderMode}
        />
      </div>
      <button
        type="button"
        onClick={props.syncTime}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-emerald-500/35 bg-emerald-500/[0.10] text-emerald-300 transition hover:border-emerald-400/55 hover:bg-emerald-500/[0.18] active:scale-[0.95]"
        title="Sync time to now"
        aria-label="Sync time to now"
      >
        <svg
          className="h-[18px] w-[18px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 12a9 9 0 1 1-3.5-7.1" />
          <path d="M21 4v5h-5" />
        </svg>
      </button>
    </div>
  );
}

/* ---------------- Incoming transit alert ----------------------------------- */

function IncomingTransitAlert({
  count,
  topRow,
  onOpen,
  onDismiss,
  compact,
}: {
  count: number;
  topRow: { callSign: string; deltaAzDeg: number; nudge: string } | null;
  onOpen: () => void;
  onDismiss: () => void;
  compact?: boolean;
}) {
  if (!topRow) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="incoming-transit-alert"
      className={`pointer-events-auto absolute z-[18] rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/[0.12] via-sky-500/[0.06] to-transparent p-4 backdrop-blur-2xl ${
        compact
          ? "left-2 right-2 top-[calc(7.5rem+env(safe-area-inset-top))]"
          : "right-[6.5rem] bottom-[10rem] w-[320px]"
      }`}
      style={{
        boxShadow:
          "0 0 0 1px rgba(52,211,153,0.18), 0 24px 64px -16px rgba(0,0,0,0.7), 0 0 32px -8px rgba(52,211,153,0.4)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="mt-section-label-emerald flex items-center gap-2">
          <span
            aria-hidden
            className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_currentColor]"
          />
          On the ray · {count}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-2 block w-full text-left"
      >
        <h4 className="font-mono text-[20px] font-bold tracking-wide text-zinc-50">
          {topRow.callSign}
        </h4>
        <p className="mt-1 text-[13.5px] leading-snug text-zinc-300">
          {topRow.nudge}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          <span>Δ azimut</span>
          <span className="font-mono text-[14px] font-bold text-sky-300">
            {formatFixed(topRow.deltaAzDeg, 2)}°
          </span>
        </div>
      </button>
    </div>
  );
}


/* ---------------- Mobile dock --------------------------------------------- */

type DockId = RailItemId | "more";

const DOCK_PRIMARY: readonly { id: DockId; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; accent: RailItem["accent"] }[] = [
  { id: "active", label: "Active", icon: SectionIconPaperAirplane, accent: "moon" },
  { id: "candidates", label: "Tracks", icon: SectionIconArrowsRightLeft, accent: "sky" },
  { id: "photo", label: "Photo", icon: SectionIconCamera, accent: "mint" },
  { id: "filters", label: "Filters", icon: SectionIconFunnel, accent: "violet" },
];

function MobileDock({
  activeId,
  onSelect,
  badges,
}: {
  activeId: DockId | null;
  onSelect: (id: DockId) => void;
  badges: Partial<Record<DockId, number>>;
}) {
  return (
    <nav
      data-testid="mobile-primary-nav"
      aria-label="Primary mobile navigation"
      className="absolute inset-x-0 bottom-0 z-[60] border-t border-[color:var(--glass-stroke)] bg-[color:var(--glass-2)] px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl backdrop-saturate-150"
    >
      <div role="tablist" className="flex items-center gap-2">
        {DOCK_PRIMARY.map((item) => {
          const Icon = item.icon;
          const selected = activeId === item.id;
          const badge = badges[item.id];
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              data-testid={`mobile-shell-tab-${item.id}`}
              aria-selected={selected}
              onClick={() => onSelect(item.id)}
              className={`relative flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border text-[11.5px] font-semibold tracking-tight transition active:scale-[0.97] ${
                selected
                  ? `${ACCENT_BTN[item.accent]} shadow-[0_0_20px_-8px_rgba(96,165,250,0.3)]`
                  : "border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" />
              <span>{item.label}</span>
              {badge && badge > 0 ? (
                <span
                  aria-hidden
                  className="absolute right-2 top-1.5 min-w-[18px] rounded-full bg-amber-400 px-1 text-center font-mono text-[10px] font-bold leading-[18px] text-zinc-900"
                >
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          role="tab"
          type="button"
          data-testid="mobile-shell-tab-more"
          aria-selected={activeId === "more"}
          onClick={() => onSelect("more")}
          className={`relative flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border text-[11.5px] font-semibold tracking-tight transition active:scale-[0.97] ${
            activeId === "more"
              ? "border-violet-400/35 bg-violet-500/[0.12] text-violet-300"
              : "border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
          }`}
          aria-label="More tools"
          title="More tools"
        >
          <svg
            className="h-[22px] w-[22px]"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}

/* Portalni gumb za izlaz iz Street View moda — renderira se direktno u
   document.body, izvan svakog stacking konteksta, uvijek klikabilan. */
function StreetViewExitButton() {
  const setMapDisplayMode = useMoonTransitStore((s) => s.setMapDisplayMode);
  const hasMounted = useHasMounted();
  if (!hasMounted) return null;
  return createPortal(
    <button
      type="button"
      onClick={() => setMapDisplayMode("default")}
      className="fixed bottom-[4.5rem] left-3 z-[9999] flex items-center gap-2 rounded-2xl border border-white/15 bg-zinc-900/80 px-3 py-2 text-xs font-semibold text-zinc-200 shadow-lg backdrop-blur-md transition hover:bg-zinc-800/90 active:scale-[0.97] max-md:bottom-[calc(8.25rem+env(safe-area-inset-bottom,0px))]"
      aria-label="Exit Street View"
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 4.5l7 4-7 4-7-4 7-4zm0 8.5l7 4-7 4-7-4 7-4z" />
      </svg>
      Layers
    </button>,
    document.body,
  );
}

/* =============================================================================
   GLAVNA KOMPONENTA
   ========================================================================= */

export function HomePageClient() {
  const s = useHomeShellOrchestration();
  const flights = useMoonTransitStore((st) => st.flights);
  const mapDisplayMode = useMoonTransitStore((st) => st.mapDisplayMode);
  const isWide = useIsMdUp();
  const [flightFilterCriteria, setFlightFilterCriteria] = useState<FlightFilterCriteria>({
    query: "",
    aircraftTypes: [],
  });
  const [railOpenId, setRailOpenId] = useState<RailItemId | null>(null);
  const [mobileSheetId, setMobileSheetId] = useState<DockId | null>(null);
  /**
   * Pamtimo *koliko* aktivnih transita je korisnik zatvorio. Kad se broj
   * promijeni (novi transit ili stari prošao), alert se sam vrati. Bez
   * useEffect+setState — derived state.
   */
  const [dismissedAtCount, setDismissedAtCount] = useState<number>(-1);

  const requestPlaceObserverFromView = useObserverStore(
    (st) => st.requestPlaceObserverFromView
  );
  const requestFocusOnObserver = useObserverStore(
    (st) => st.requestFocusOnObserver
  );
  const observerLocationLocked = useObserverStore(
    (st) => st.observerLocationLocked
  );

  useWeatherSync();
  useAstronomySync();
  useFlightAircraftTypeIndexPrefetch();

  const candidateNotifications = useTransitCandidateNotifications({
    candidates: s.candidatesDisplay,
    activeTransits: s.activeTransits,
  });

  const aircraftTypeFilterOptions = useMemo(
    () => uniqueAircraftTypeFilterOptions(flights),
    [flights]
  );

  const filteredFlightCount = useMemo(
    () =>
      flightFilterCriteria.query.trim()
        ? filterFlightsByCriteria(flights, flightFilterCriteria).length
        : null,
    [flights, flightFilterCriteria]
  );

  const handleSyncTime = useCallback(() => {
    resumeSharedAudioFromUserGesture();
    s.syncTime();
  }, [s]);

  // Na mobileu — odabir leta iz panela zatvara sheet da popup postane vidljiv
  const handleSelectFlightFromPanel = useCallback(
    (id: string) => {
      s.setSelectedFlightId(id);
      if (!isWide) {
        setMobileSheetId(null);
      }
    },
    [s, isWide]
  );

  /* ---- Top "incoming" transit (za alert) -------------------------------- */
  const activeCount = s.activeTransits.length;
  const topAlertRow = useMemo(() => {
    if (s.activeTransits.length === 0) return null;
    const r = s.activeTransits[0];
    if (!r) return null;
    return {
      callSign: r.flight.callSign ?? r.flight.id,
      deltaAzDeg: r.deltaAzDeg,
      nudge: r.nudgeLine,
    };
  }, [s.activeTransits]);

  /** Alert je dismissan dok god je *broj* transita isti kao u trenutku
   * kad je korisnik kliknuo X. Promjena broja => alert se vrati. */
  const showIncomingAlert =
    topAlertRow !== null && dismissedAtCount !== activeCount;

  const railBadges: Partial<Record<RailItemId, number>> = useMemo(() => {
    const b: Partial<Record<RailItemId, number>> = {};
    if (s.activeTransits.length > 0) b.active = s.activeTransits.length;
    if (s.candidatesDisplay.length > 0) b.candidates = s.candidatesDisplay.length;
    return b;
  }, [s.activeTransits.length, s.candidatesDisplay.length]);

  const dockBadges: Partial<Record<DockId, number>> = useMemo(() => {
    const b: Partial<Record<DockId, number>> = {};
    if (s.activeTransits.length > 0) b.active = s.activeTransits.length;
    if (s.candidatesDisplay.length > 0) b.candidates = s.candidatesDisplay.length;
    return b;
  }, [s.activeTransits.length, s.candidatesDisplay.length]);

  /* ---- Renderer panela (zajednički za rail i mobile sheet) -------------- */
  const renderPanel = useCallback(
    (id: RailItemId | "more"): React.ReactNode => {
      if (id === "active") {
        return (
          <ActiveTransitsPanel
            rows={s.activeTransits}
            showEphemeris={s.showEphemeris}
            selectedFlightId={s.selectedFlightId}
            onSelectFlight={handleSelectFlightFromPanel}
          />
        );
      }
      if (id === "moon") {
        return (
          <MoonEphemerisPanel
            moon={s.moon}
            observer={s.obs}
            display={s.moonDisplay}
            moonRise={s.moonRise}
            moonSet={s.moonSet}
            moonRiseSetKind={s.moonRiseSetKind}
            showEphemeris={s.showEphemeris}
            isMoonBelowHorizon={s.isMoonBelowHorizon}
            snapshotContext={{
              referenceEpochMs: s.referenceEpochMs,
              observerLat: s.obs.lat,
              observerLng: s.obs.lng,
              observerGroundHeightMeters: s.obs.groundHeightMeters,
            }}
          />
        );
      }
      if (id === "candidates") {
        return (
          <TransitCandidatesPanel
            candidates={s.candidatesDisplay}
            isLoading={s.isLoading}
            error={s.error}
            showEmpty={s.showEmptyCandidates}
            showEphemeris={s.showEphemeris}
            selectedFlightId={s.selectedFlightId}
            notificationsSupported={candidateNotifications.notificationsSupported}
            notificationPermission={candidateNotifications.permission}
            watchedFlightIds={candidateNotifications.watchedFlightIds}
            onSelectFlight={handleSelectFlightFromPanel}
            onToggleWatchFlight={candidateNotifications.toggleWatchForFlight}
          />
        );
      }
      if (id === "photo") {
        return (
          <PhotographerToolsPanel
            selectedFlightId={s.selectedFlightId}
            photoPack={s.photoPack}
            photoShotFeasibility={s.photoShotFeasibility}
            photoUnavailableReason={s.photoUnavailableReason}
            beepOnTransit={s.beepOnTransit}
            onToggleBeep={() => {
              s.setBeepOnTransit((b) => !b);
            }}
          />
        );
      }
      if (id === "compass") {
        return <CompassAimPanel />;
      }
      if (id === "field") {
        return <FieldOverlaysSection />;
      }
      if (id === "ar") {
        return <ArSkyCameraPanel />;
      }
      if (id === "observer") {
        return (
          <div className="space-y-3">
            <ObserverLocationPanel
              observer={s.obs}
              onUseGps={s.onUseGps}
              gpsBusy={s.gpsBusy}
              gpsError={s.gpsError}
              locationActionsDisabled={s.observerLocationLocked}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={requestPlaceObserverFromView}
                disabled={observerLocationLocked}
                className="min-h-[48px] rounded-2xl border border-amber-500/35 bg-amber-500/[0.10] px-3 py-3 text-[13.5px] font-semibold text-amber-200 shadow-[0_4px_16px_-8px_rgba(251,191,36,0.5)] transition hover:border-amber-400/55 hover:bg-amber-500/[0.16] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Set my location here
              </button>
              <button
                type="button"
                onClick={requestFocusOnObserver}
                className="min-h-[48px] rounded-2xl border border-sky-500/30 bg-sky-500/[0.08] px-3 py-3 text-[13.5px] font-semibold text-sky-200 shadow-[0_4px_16px_-8px_rgba(96,165,250,0.45)] transition hover:border-sky-400/50 hover:bg-sky-500/[0.14] active:scale-[0.97]"
              >
                Focus on me
              </button>
            </div>
          </div>
        );
      }
      if (id === "flight") {
        return (
          <FlightSourcePanel
            flightProviderId={s.flightProviderId}
            liveFlightFeeds={s.liveFlightFeeds}
            onLiveFlightFeedsChange={s.setLiveFlightFeeds}
          />
        );
      }
      if (id === "filters") {
        return (
          <FlightFiltersPanel
            searchQuery={flightFilterCriteria.query}
            onSearchQueryChange={(next) =>
              setFlightFilterCriteria((prev) => ({ ...prev, query: next }))
            }
            aircraftTypeOptions={aircraftTypeFilterOptions}
            selectedAircraftTypes={flightFilterCriteria.aircraftTypes}
            onSelectedAircraftTypesChange={(next) =>
              setFlightFilterCriteria((prev) => ({ ...prev, aircraftTypes: [...next] }))
            }
          />
        );
      }
      // "more" — grid svih ostalih panela
      return <MoreToolsGrid onSelect={(panelId) => setMobileSheetId(panelId)} />;
    },
    [
      s,
      candidateNotifications,
      aircraftTypeFilterOptions,
      flightFilterCriteria,
      observerLocationLocked,
      requestFocusOnObserver,
      requestPlaceObserverFromView,
    ]
  );

  /* ---- Otvori specifičan panel iz alerta -------------------------------- */
  const openActiveFromAlert = useCallback(() => {
    if (isWide) {
      setRailOpenId("active");
    } else {
      setMobileSheetId("active");
    }
  }, [isWide]);

  /* =========================================================================
     RENDER
     ===================================================================== */

  return (
    <div className="mt-app-root relative flex h-dvh min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden">
      <GoldenAlignmentFlash
        token={s.goldenFlashToken}
        onAnimationEnd={() => {
          s.setGoldenFlashToken(null);
        }}
      />
      <AddToHomeScreenPrompt />

      {/* === MAPA — full bleed pozadina === */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          flightProvider={s.flightProvider}
          isGolden={s.isGolden}
          fieldSoundsEnabled={s.beepOnTransit}
          flightFilterCriteria={flightFilterCriteria}
          suppressSelectedAircraftPopup={!isWide && mobileSheetId != null}
        />
      </div>

      {/* === STREET VIEW FULLSCREEN LAYER — iznad mape, ispod UI panela === */}
      {mapDisplayMode === "streetview" && (
        <div className="absolute inset-0 z-[1]">
          <StreetViewFullscreen
            moon={s.moon}
            observer={s.obs}
            nowMs={s.referenceEpochMs}
            candidates={s.candidatesDisplay}
            activeTransits={s.activeTransits}
          />
        </div>
      )}

      {/* === EXIT STREET VIEW — vidljivo iznad Street View overlaya (z-[2]) === */}
      {mapDisplayMode === "streetview" && (
        <StreetViewExitButton />
      )}

      {/* === DESKTOP UI === */}
      {isWide ? (
        <>
          {/* Top bar — jedan flex container: brand | search (flex-1) | actions.
              Flex layout sprječava sudaranje pri uskim širinama: search se prirodno
              skuplja umjesto da prelazi preko weather chip-a. */}
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-[20] flex items-center gap-3 pt-[env(safe-area-inset-top)]">
            <BrandPill />
            <div className="flex min-w-0 flex-1 justify-center">
              <CommandBar
                query={flightFilterCriteria.query}
                onChange={(next) =>
                  setFlightFilterCriteria((prev) => ({ ...prev, query: next }))
                }
                resultCount={filteredFlightCount}
                widthClass="w-full max-w-[420px]"
              />
            </div>
            <TopRightCluster
              onPlace={requestPlaceObserverFromView}
              onFocus={requestFocusOnObserver}
              observerLocked={observerLocationLocked}
            />
          </div>

          {/* Right rail */}
          <FloatingRail
            expandedId={railOpenId}
            onSelect={(id) =>
              setRailOpenId((prev) => (prev === id ? null : id))
            }
            onClose={() => setRailOpenId(null)}
            badges={railBadges}
          >
            {railOpenId ? renderPanel(railOpenId) : null}
          </FloatingRail>

          {/* Time ribbon dolje */}
          <TimeRibbon
            referenceEpochMs={s.referenceEpochMs}
            offsetHours={s.offsetHours}
            onSlider={s.onSlider}
            showEphemeris={s.showEphemeris}
            isMoonBelowHorizon={s.isMoonBelowHorizon}
            sliderWidthHours={s.sliderWidthHours}
            timeSliderStartLabel={s.timeSliderStartLabel}
            timeSliderEndLabel={s.timeSliderEndLabel}
            timeSliderMode={s.timeSliderMode}
            syncTime={handleSyncTime}
          />

          {/* Incoming transit alert */}
          {showIncomingAlert ? (
            <IncomingTransitAlert
              count={s.activeTransits.length}
              topRow={topAlertRow}
              onOpen={openActiveFromAlert}
              onDismiss={() => setDismissedAtCount(activeCount)}
            />
          ) : null}
        </>
      ) : (
        /* === MOBILE UI === */
        <>
          {/* Top bar — jedan flex row: brand | search (flex-1) | locate+focus
              (vertikalni stack desno). Search se prirodno skuplja na uskim
              ekranima. Action stack se sakriva kad je popup/sheet otvoren. */}
          <div className="pointer-events-none absolute inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] z-[78] flex items-start gap-2">
            <BrandPill size="compact" />
            <div className="min-w-0 flex-1">
              <CommandBar
                query={flightFilterCriteria.query}
                onChange={(next) =>
                  setFlightFilterCriteria((prev) => ({ ...prev, query: next }))
                }
                resultCount={filteredFlightCount}
                widthClass="w-full"
              />
            </div>
            <div
              className={`flex shrink-0 flex-col gap-2 transition-opacity duration-200 ${
                s.selectedFlightId != null || mobileSheetId != null
                  ? "pointer-events-none opacity-0"
                  : ""
              }`}
              aria-hidden={s.selectedFlightId != null || mobileSheetId != null}
            >
              <button
                type="button"
                onClick={requestPlaceObserverFromView}
                disabled={observerLocationLocked}
                title="Set location"
                aria-label="Set my location here"
                className="mt-glass-elevated pointer-events-auto grid h-11 w-11 place-items-center rounded-full text-amber-300 transition hover:border-amber-400/50 active:scale-[0.95] disabled:opacity-40"
              >
                <svg
                  className="h-[18px] w-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 22s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={requestFocusOnObserver}
                title="Focus on me"
                aria-label="Focus on me"
                className="mt-glass-elevated pointer-events-auto grid h-11 w-11 place-items-center rounded-full text-sky-300 transition hover:border-sky-400/50 active:scale-[0.95]"
              >
                <svg
                  className="h-[18px] w-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Time ribbon iznad docka */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[14]">
            <TimeRibbon
              referenceEpochMs={s.referenceEpochMs}
              offsetHours={s.offsetHours}
              onSlider={s.onSlider}
              showEphemeris={s.showEphemeris}
              isMoonBelowHorizon={s.isMoonBelowHorizon}
              sliderWidthHours={s.sliderWidthHours}
              timeSliderStartLabel={s.timeSliderStartLabel}
              timeSliderEndLabel={s.timeSliderEndLabel}
              timeSliderMode={s.timeSliderMode}
              syncTime={handleSyncTime}
              compact
            />
          </div>

          {/* Incoming transit alert — preko ribbona kad active > 0 */}
          {showIncomingAlert ? (
            <IncomingTransitAlert
              count={s.activeTransits.length}
              topRow={topAlertRow}
              onOpen={openActiveFromAlert}
              onDismiss={() => setDismissedAtCount(activeCount)}
              compact
            />
          ) : null}

          {/* Bottom sheet (otvara se klikom na dock chip) */}
          {mobileSheetId ? (
            <MobileSheet
              id={mobileSheetId}
              onClose={() => setMobileSheetId(null)}
            >
              {renderPanel(mobileSheetId)}
            </MobileSheet>
          ) : null}

          {/* Dock */}
          <MobileDock
            activeId={mobileSheetId}
            onSelect={(id) => {
              setMobileSheetId((prev) => (prev === id ? null : id));
            }}
            badges={dockBadges}
          />
        </>
      )}
    </div>
  );
}

/* ---------------- Mobile sheet (preuzima ulogu starog tab sheeta) --------- */

const MOBILE_PANEL_TITLES: Record<DockId, string> = {
  active: "Active transits",
  moon: "Moon (nowcast)",
  candidates: "Transit candidates",
  photo: "Photographer — tools",
  compass: "Compass → Moon",
  field: "Field overlays",
  observer: "Observer",
  flight: "Flight source",
  filters: "Flight filters",
  ar: "AR sky overlay",
  more: "All tools",
};

const MOBILE_PANEL_ACCENT: Record<DockId, RailItem["accent"]> = {
  active:     "moon",
  moon:       "moon",
  candidates: "sky",
  photo:      "mint",
  compass:    "rose",
  field:      "mint",
  observer:   "moon",
  flight:     "violet",
  filters:    "violet",
  ar:         "sky",
  more:       "violet",
};

const ACCENT_DOT: Record<RailItem["accent"], string> = {
  moon:   "bg-amber-400 text-amber-400 shadow-amber-400/70",
  sky:    "bg-sky-400 text-sky-400 shadow-sky-400/70",
  mint:   "bg-emerald-400 text-emerald-400 shadow-emerald-400/70",
  rose:   "bg-rose-400 text-rose-400 shadow-rose-400/70",
  violet: "bg-violet-400 text-violet-400 shadow-violet-400/70",
};

function MobileSheet({
  id,
  onClose,
  children,
}: {
  id: DockId;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [snap, setSnap] = useState<"peek" | "half" | "full">("half");
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartYRef = useRef<number | null>(null);

  const heightClass = snap === "full" ? "h-[78dvh]" : snap === "half" ? "h-[60dvh]" : "h-[44dvh]";

  return (
    <section
      className={`absolute inset-x-1.5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[75] flex max-h-[82dvh] flex-col overflow-hidden rounded-3xl border border-[color:var(--glass-stroke-strong)] bg-[color:var(--glass-3)] shadow-[0_-20px_64px_-12px_rgba(0,0,0,0.75)] backdrop-blur-2xl backdrop-saturate-150 transition-[height,transform] duration-300 motion-reduce:transition-none ${heightClass}`}
      aria-label={`${MOBILE_PANEL_TITLES[id]} controls`}
      style={{
        transform: `translateY(${Math.max(0, dragOffset)}px)`,
        transitionTimingFunction: "cubic-bezier(0.2, 0.9, 0.2, 1.06)",
      }}
    >
      <header
        className="relative flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 pb-3 pt-5"
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
            if (snap === "full") setSnap("half");
            else if (snap === "half") setSnap("peek");
            else onClose();
          } else if (dragOffset < -90) {
            if (snap === "peek") setSnap("half");
            else if (snap === "half") setSnap("full");
          }
          touchStartYRef.current = null;
          setDragOffset(0);
        }}
      >
        <button
          type="button"
          onClick={() => {
            setSnap((prev) =>
              prev === "peek" ? "half" : prev === "half" ? "full" : "peek"
            );
          }}
          className="absolute left-1/2 top-2 h-[5px] w-11 -translate-x-1/2 rounded-full bg-zinc-500/55 transition hover:bg-zinc-400/70 active:scale-x-110 active:scale-y-125 motion-reduce:transition-none"
          aria-label="Adjust panel height"
        />
        <h2 className="mt-panel-title flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full shadow-[0_0_10px_currentColor] ${ACCENT_DOT[MOBILE_PANEL_ACCENT[id]]}`}
          />
          <span className="truncate">{MOBILE_PANEL_TITLES[id]}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-full border border-white/[0.10] bg-white/[0.06] px-4 text-[13px] font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.10] active:scale-[0.97]"
          aria-label="Close panel"
        >
          Done
        </button>
      </header>
      <div
        id="mobile-shell-sheet-panel"
        data-testid="mobile-deck-content"
        role="tabpanel"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-zinc-200 [scrollbar-gutter:stable]"
      >
        {children}
      </div>
    </section>
  );
}

/* ---------------- "More tools" grid (mobile) ------------------------------ */

const MORE_PANELS: readonly { id: RailItemId; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; accent: RailItem["accent"] }[] = [
  { id: "moon", label: "Moon", icon: SectionIconMoon, accent: "moon" },
  { id: "observer", label: "Observer", icon: SectionIconObserver, accent: "moon" },
  { id: "ar", label: "AR sky overlay", icon: SectionIconAR, accent: "sky" },
  { id: "compass", label: "Compass", icon: SectionIconArrowUpCircle, accent: "rose" },
  { id: "flight", label: "Flight source", icon: SectionIconFlightSource, accent: "violet" },
  { id: "field", label: "Field overlays", icon: SectionIconField, accent: "mint" },
];

const ACCENT_GRID_BTN: Record<RailItem["accent"], string> = {
  moon:   "border-amber-400/25 bg-amber-500/[0.07] hover:border-amber-400/45 hover:bg-amber-500/[0.12]",
  sky:    "border-sky-400/25 bg-sky-500/[0.07] hover:border-sky-400/45 hover:bg-sky-500/[0.12]",
  mint:   "border-emerald-400/25 bg-emerald-500/[0.07] hover:border-emerald-400/45 hover:bg-emerald-500/[0.12]",
  rose:   "border-rose-400/25 bg-rose-500/[0.07] hover:border-rose-400/45 hover:bg-rose-500/[0.12]",
  violet: "border-violet-400/25 bg-violet-500/[0.07] hover:border-violet-400/45 hover:bg-violet-500/[0.12]",
};

function MoreToolsGrid({ onSelect }: { onSelect: (id: RailItemId) => void }) {
  return (
    <div>
      <p className="mt-section-label mb-3">All tools</p>
      <div className="grid grid-cols-2 gap-2.5">
        {MORE_PANELS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`flex min-h-[80px] flex-col items-start gap-2 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${ACCENT_GRID_BTN[p.accent]}`}
            >
              <Icon className={`h-6 w-6 ${ACCENT_ICON[p.accent]}`} />
              <span className="text-[14px] font-semibold text-zinc-100">
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
      <Link
        href="/about"
        className={`mt-3 flex min-h-[56px] items-center gap-3 rounded-2xl border px-4 py-3 transition active:scale-[0.98] ${ACCENT_GRID_BTN.sky}`}
        title="About and usage guide"
        aria-label="About and usage guide"
      >
        <SectionIconQuestionMarkCircle className="h-6 w-6 text-sky-300" />
        <span className="text-[14px] font-semibold text-zinc-100">About / FAQ</span>
      </Link>
    </div>
  );
}
