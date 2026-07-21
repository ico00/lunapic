"use client";

import { ArSkyCameraPanel } from "@/components/field/ArSkyCameraPanel";
import { CompassAimPanel } from "@/components/field/CompassAimPanel";
import { FieldOverlaysSection } from "@/components/field/FieldOverlaysSection";
import { AddToHomeScreenPrompt } from "@/components/shell/AddToHomeScreenPrompt";
import { GoldenAlignmentFlash } from "@/components/shell/GoldenAlignmentFlash";
import { ActiveTransitsPanel } from "@/components/shell/panels/ActiveTransitsPanel";
import { FlightFiltersPanel } from "@/components/shell/panels/FlightFiltersPanel";
import { FlightLogPanel } from "@/components/shell/panels/FlightLogPanel";
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
import { useCandidateAlerts } from "@/hooks/useCandidateAlerts";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { TransitAlertToast } from "@/components/shell/TransitAlertToast";
import { NotificationPermissionPrompt } from "@/components/shell/NotificationPermissionPrompt";
import { useFlightAircraftTypeIndexPrefetch } from "@/hooks/useFlightAircraftTypeIndexPrefetch";
import { useAstronomySync } from "@/hooks/useAstronomySync";
import { useWeatherSync } from "@/hooks/useWeatherSync";
import {
  SectionIconTime,
  SectionIconQuestionMarkCircle,
} from "@/components/shell/sectionCategoryIcons";
import {
  PANEL_REGISTRY,
  PANEL_BY_ID,
  DOCK_PRIMARY_PANELS,
  MORE_PANEL_META,
  type PanelId,
  type SheetId,
  type PanelAccent,
} from "@/components/shell/panelRegistry";
import { resumeSharedAudioFromUserGesture } from "@/lib/audio/fieldAudio";
import { appPath } from "@/lib/paths/appPath";
import { formatFixed } from "@/lib/format/numbers";
import {
  type FlightFilterCriteria,
  uniqueAircraftTypeFilterOptions,
  filterFlightsByCriteria,
} from "@/lib/flight/flightSearch";
import { computeShotFeasibleFlightIds } from "@/lib/domain/transit/computeShotFeasibleFlightIds";
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
      className="pointer-events-auto inline-flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-1 transition hover:opacity-80 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/75"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={appPath("/logo.png")}
        alt=""
        width={isCompact ? 26 : 30}
        height={isCompact ? 26 : 30}
        decoding="async"
        fetchPriority="high"
        className={isCompact ? "h-[26px] w-auto object-contain" : "h-[30px] w-auto object-contain"}
      />
      <span className={`mt-title shrink-0 leading-none tracking-tight ${isCompact ? "text-[15px]" : "text-[length:var(--fs-body-strong)]"}`}>
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
  floating = false,
}: {
  query: string;
  onChange: (q: string) => void;
  resultCount: number | null;
  /** Tailwind width class — desktop default, mobile prosljeđuje `w-full`. */
  widthClass?: string;
  /** Kad je true, bar dobiva vlastiti glass background (koristi se kad lebdi van headera). */
  floating?: boolean;
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
    <div className={`pointer-events-auto flex h-11 items-center gap-2.5 rounded-full border px-3.5 transition focus-within:ring-1 focus-within:ring-sky-500/30 ${floating ? "mt-glass-elevated border-white/[0.12] focus-within:border-white/[0.22]" : "border-white/[0.08] bg-white/[0.04] focus-within:border-white/[0.22]"} ${widthClass}`}>
      <svg
        className="h-[17px] w-[17px] shrink-0 cursor-pointer text-[color:var(--t-tertiary)]"
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
        placeholder="Search flights…"
        aria-label="Search flights"
        className="flex-1 min-w-0 bg-transparent text-[16px] text-[color:var(--t-primary)] outline-none placeholder:text-[color:var(--t-tertiary)]"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {hasQuery && resultCount !== null && (
        <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[length:var(--fs-label)] font-medium text-sky-300">
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
          className="shrink-0 rounded-full p-0.5 text-[color:var(--t-tertiary)] transition hover:text-[color:var(--t-primary)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <span className="hidden shrink-0 rounded-md border border-white/[0.10] bg-white/[0.04] px-1.5 py-[2px] font-mono text-[length:var(--fs-label)] text-[color:var(--t-tertiary)] md:inline-block">
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
  onGps,
  gpsBusy,
  observerLocked,
}: {
  onPlace: () => void;
  onFocus: () => void;
  onGps: () => void;
  gpsBusy: boolean;
  observerLocked: boolean;
}) {
  return (
    <div className="pointer-events-auto flex shrink-0 items-center gap-1">
      <WeatherOverlay />
      <div className="mx-2 h-5 w-px shrink-0 bg-white/[0.12]" aria-hidden />
      <button
        type="button"
        onClick={onGps}
        disabled={gpsBusy || observerLocked}
        title="Use my GPS"
        aria-label="Use my GPS — set observer to device location"
        className="grid h-9 w-9 place-items-center rounded-full text-emerald-300 transition hover:bg-emerald-500/15 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/75 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {gpsBusy ? (
          <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-3.5-7.1" />
          </svg>
        ) : (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={onPlace}
        disabled={observerLocked}
        title="Set my location here"
        aria-label="Set my location here — current view center becomes observer"
        className="grid h-9 w-9 place-items-center rounded-full text-amber-300 transition hover:bg-amber-500/15 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500/75 disabled:cursor-not-allowed disabled:opacity-40"
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
        className="grid h-9 w-9 place-items-center rounded-full text-sky-300 transition hover:bg-sky-500/15 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/75"
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

const RAIL_ITEMS = PANEL_REGISTRY;

const ACCENT_BTN: Record<PanelAccent, string> = {
  moon: "border-amber-400/35 bg-amber-500/[0.12] text-amber-300",
  sky: "border-sky-400/35 bg-sky-500/[0.12] text-sky-300",
  mint: "border-emerald-400/35 bg-emerald-500/[0.12] text-emerald-300",
  rose: "border-rose-400/35 bg-rose-500/[0.12] text-rose-300",
  violet: "border-violet-400/35 bg-violet-500/[0.12] text-violet-300",
};

const ACCENT_ICON: Record<PanelAccent, string> = {
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
  warnIds,
  children,
}: {
  expandedId: PanelId | null;
  onSelect: (id: PanelId) => void;
  onClose: () => void;
  badges: Partial<Record<PanelId, number>>;
  warnIds?: Partial<Record<PanelId, boolean>>;
  children: React.ReactNode;
}) {
  const expanded = expandedId !== null;
  const item = RAIL_ITEMS.find((r) => r.id === expandedId);

  return (
    <aside
      aria-label="Tools"
      className={`mt-glass-elevated pointer-events-auto absolute right-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)] z-[15] flex overflow-hidden rounded-3xl transition-[width] duration-300 ease-[cubic-bezier(0.2,0.9,0.2,1.06)] ${
        expanded
          ? `bottom-[8.5rem] ${item?.wide ? "w-[min(50vw,960px)]" : "w-[420px]"}`
          : "h-fit max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-0.75rem-8.5rem)] w-[72px] overflow-y-auto"
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
          const warn = warnIds?.[item.id] ?? false;
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
                  : "border-transparent text-[color:var(--t-tertiary)] hover:bg-white/[0.05] hover:text-[color:var(--t-primary)]"
              }`}
            >
              <Icon className={`h-[22px] w-[22px] ${
                isOpen ? ACCENT_ICON[item.accent] : `${ACCENT_ICON[item.accent]} opacity-50`
              }`} />
              {badge && badge > 0 ? (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-amber-400 px-1 font-mono text-[length:var(--fs-micro)] font-bold leading-[18px] text-zinc-900"
                >
                  {badge}
                </span>
              ) : warn ? (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] ring-2 ring-[color:var(--bg-1)]"
                />
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
            className="relative grid h-12 w-12 place-items-center rounded-2xl border border-transparent text-[color:var(--t-tertiary)] transition hover:bg-white/[0.05] hover:text-[color:var(--t-primary)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/75"
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
                  ACCENT_BTN[item.accent].split(" ").find((c) => c.startsWith("text-")) ?? "text-[color:var(--t-secondary)]"
                }`}
              />
              <span className="truncate">{item.label}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.10] bg-white/[0.04] text-[color:var(--t-secondary)] transition hover:border-white/[0.20] hover:bg-white/[0.08]"
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

function localDateInputValue(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const CALENDAR_WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

function localMidnightMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Custom kalendar popup u stilu comboboxa (spec §4 / §10.1): portal na body,
 * `position: fixed`, otvara se IZNAD sidra (native date popup se ne može ni
 * pozicionirati ni stilizirati, pa je na full-screenu bježao ispod ruba).
 */
function PlanningCalendarPopup(props: {
  anchor: HTMLElement;
  selectedValue: string;
  isPlanned: boolean;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const { anchor, selectedValue, isPlanned, onPick, onClose } = props;
  // Mobile: full-screen modal s backdropom (anchored popup se gura preko
  // altitude legende i docka — previše elemenata). Desktop: popup iznad ribbona.
  const isMdUp = useIsMdUp();
  const popupRef = useRef<HTMLDivElement | null>(null);
  const todayMs = localMidnightMs(Date.now());
  const selectedMs = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedValue);
    return m
      ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
      : todayMs;
  }, [selectedValue, todayMs]);
  const [viewYear, setViewYear] = useState(() => new Date(selectedMs).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date(selectedMs).getMonth());

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popupRef.current?.contains(t) && !anchor.contains(t)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const rect = anchor.getBoundingClientRect();
  const POPUP_WIDTH = 272;
  const left = Math.max(
    8,
    Math.min(rect.right - POPUP_WIDTH, window.innerWidth - POPUP_WIDTH - 8)
  );
  const bottom = window.innerHeight - rect.top + 8;
  const dayCellClass = isMdUp ? "h-8 w-8" : "h-11 w-11";

  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // ponedjeljak prvi
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const canGoPrev =
    new Date(viewYear, viewMonth, 1).getTime() >
    new Date(new Date(todayMs).getFullYear(), new Date(todayMs).getMonth(), 1).getTime();

  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const card = (
    <div
      ref={popupRef}
      className={`rounded-2xl border border-white/10 bg-zinc-900/95 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md ${
        isMdUp ? "fixed z-[280] p-3" : "w-[min(22rem,100%)] p-4"
      }`}
      style={isMdUp ? { left, bottom, width: POPUP_WIDTH } : undefined}
      role="dialog"
      aria-label="Pick a planning date"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            const prev = new Date(viewYear, viewMonth - 1, 1);
            setViewYear(prev.getFullYear());
            setViewMonth(prev.getMonth());
          }}
          disabled={!canGoPrev}
          className="grid h-9 w-9 place-items-center rounded-full text-[color:var(--t-secondary)] transition hover:bg-white/[0.08] hover:text-amber-300 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-[length:var(--fs-label)] font-semibold text-[color:var(--t-primary)]">
          {monthTitle}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = new Date(viewYear, viewMonth + 1, 1);
              setViewYear(next.getFullYear());
              setViewMonth(next.getMonth());
            }}
            className="grid h-9 w-9 place-items-center rounded-full text-[color:var(--t-secondary)] transition hover:bg-white/[0.08] hover:text-amber-300"
            aria-label="Next month"
          >
            ›
          </button>
          {!isMdUp && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full text-[color:var(--t-secondary)] transition hover:bg-white/[0.08] hover:text-[color:var(--t-primary)]"
              aria-label="Close calendar"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-y-0.5 text-center">
        {CALENDAR_WEEKDAY_LABELS.map((w) => (
          <span
            key={w}
            className="py-1 text-[length:var(--fs-meta)] font-medium text-[color:var(--t-tertiary)]"
          >
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day == null) {
            return <span key={`b${i}`} />;
          }
          const cellMs = new Date(viewYear, viewMonth, day).getTime();
          const isPast = cellMs < todayMs;
          const isToday = cellMs === todayMs;
          const isSelected = isPlanned && cellMs === selectedMs;
          const mm = String(viewMonth + 1).padStart(2, "0");
          const dd = String(day).padStart(2, "0");
          return (
            <button
              key={day}
              type="button"
              disabled={isPast}
              onClick={() => onPick(`${viewYear}-${mm}-${dd}`)}
              className={`mx-auto grid ${dayCellClass} place-items-center rounded-full font-mono text-[length:var(--fs-label)] tabular-nums transition ${
                isSelected
                  ? "bg-amber-500/25 font-semibold text-amber-300 ring-1 ring-amber-400/60"
                  : isToday
                    ? "text-emerald-300 ring-1 ring-emerald-500/45 hover:bg-emerald-500/[0.12]"
                    : isPast
                      ? "text-zinc-600"
                      : "text-[color:var(--t-secondary)] hover:bg-amber-500/[0.12] hover:text-amber-200"
              }`}
              aria-label={`${dd}/${mm}/${viewYear}`}
              aria-pressed={isSelected}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p className="mt-2 border-t border-white/[0.07] pt-2 text-center text-[length:var(--fs-meta)] leading-snug text-[color:var(--t-tertiary)]">
        {isPlanned
          ? "Pick today or press Sync to return to live."
          : "Pick a future date to plan moon geometry."}
      </p>
    </div>
  );

  if (!isMdUp) {
    // Mobile: full-screen modal — backdrop prekriva altitude legendu, dock i
    // ribbon, pa se kalendar ne miješa s ostalim elementima.
    return createPortal(
      <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        {card}
      </div>,
      document.body
    );
  }

  return createPortal(card, document.body);
}

/** Kalendar gumb — otvara custom popup IZNAD ribbona (spec §10.1). */
function PlanningDateButton(props: {
  isPlanned: boolean;
  planningDateValue: string;
  onPlanningDate: (value: string) => void;
  sizeClass: string;
  iconClass: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`grid shrink-0 place-items-center rounded-full border transition active:scale-[0.95] ${props.sizeClass} ${
          props.isPlanned
            ? "border-amber-500/50 bg-amber-500/[0.16] text-amber-300"
            : "border-white/15 bg-white/[0.06] text-[color:var(--t-secondary)] hover:border-amber-400/40 hover:bg-amber-500/[0.08] hover:text-amber-300"
        }`}
        title={
          props.isPlanned
            ? "Planning mode — pick another date, or Sync to return to live"
            : "Plan a future date"
        }
        aria-label="Plan a future date"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          className={props.iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 9h18" />
        </svg>
      </button>
      {open && btnRef.current && (
        <PlanningCalendarPopup
          anchor={btnRef.current}
          selectedValue={props.planningDateValue}
          isPlanned={props.isPlanned}
          onPick={(value) => {
            props.onPlanningDate(value);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

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
  isPlanned: boolean;
  planningDateValue: string;
  onPlanningDate: (value: string) => void;
  compact?: boolean;
}) {
  if (props.compact) {
    // Mobile slim ribbon — tanka pilula 44px s [time | slider | offset | sync ikona]
    return (
      <div className="mt-glass-elevated pointer-events-auto absolute z-[14] left-2 right-2 bottom-[var(--mobile-ribbon-bottom)] flex h-11 items-center gap-2 rounded-full px-3.5">
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
        <PlanningDateButton
          isPlanned={props.isPlanned}
          planningDateValue={props.planningDateValue}
          onPlanningDate={props.onPlanningDate}
          sizeClass="h-8 w-8"
          iconClass="h-4 w-4"
        />
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
      <PlanningDateButton
        isPlanned={props.isPlanned}
        planningDateValue={props.planningDateValue}
        onPlanningDate={props.onPlanningDate}
        sizeClass="h-9 w-9"
        iconClass="h-[18px] w-[18px]"
      />
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

/* ---------------- Green zone (shot-feasible) alert ------------------------ */

function GreenZoneAlert({
  count,
  callSign,
  onOpen,
  onDismiss,
  compact,
}: {
  count: number;
  callSign: string;
  onOpen: () => void;
  onDismiss: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="green-zone-alert"
      className={`pointer-events-auto absolute z-[17] rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/[0.12] via-yellow-500/[0.06] to-transparent p-4 backdrop-blur-2xl ${
        compact
          ? "left-2 right-2 top-[calc(3.5rem+env(safe-area-inset-top)+3.25rem+9rem)]"
          : "right-[6.5rem] bottom-[16rem] w-[320px]"
      }`}
      style={{
        boxShadow:
          "0 0 0 1px rgba(251,191,36,0.18), 0 24px 64px -16px rgba(0,0,0,0.7), 0 0 32px -8px rgba(251,191,36,0.35)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="mt-section-label flex items-center gap-2 text-amber-300">
          <span
            aria-hidden
            className="size-2 shrink-0 animate-pulse rounded-full bg-amber-400 shadow-[0_0_10px_currentColor]"
          />
          In shot zone · {count}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss green zone alert"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[color:var(--t-tertiary)] transition hover:bg-white/[0.06] hover:text-[color:var(--t-primary)]"
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
        <h4 className="font-mono text-[length:var(--fs-h1)] font-bold tracking-[0.01em] text-[color:var(--t-primary)]">
          {callSign}
        </h4>
        <p className="mt-1 text-[length:var(--fs-meta)] leading-snug text-[color:var(--t-secondary)]">
          Aircraft in optimal photo range — tap to open Photo tools
        </p>
      </button>
    </div>
  );
}

/* ---------------- Incoming transit alert ----------------------------------- */



/* ---------------- Mobile dock --------------------------------------------- */

type DockId = SheetId;

const DOCK_PRIMARY = DOCK_PRIMARY_PANELS;

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
              className={`relative flex h-14 flex-1 flex-col items-center justify-center rounded-2xl border transition active:scale-[0.97] ${
                selected
                  ? `${ACCENT_BTN[item.accent]} shadow-[0_0_20px_-8px_rgba(96,165,250,0.3)]`
                  : "border-white/[0.07] bg-white/[0.03] text-[color:var(--t-tertiary)] hover:bg-white/[0.06] hover:text-[color:var(--t-primary)]"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" />
              {badge && badge > 0 ? (
                <span
                  aria-hidden
                  className="absolute right-2 top-1.5 min-w-[18px] rounded-full bg-amber-400 px-1 text-center font-mono text-[length:var(--fs-micro)] font-bold leading-[18px] text-zinc-900"
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
          className={`relative flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border transition active:scale-[0.97] ${
            activeId === "more"
              ? "border-violet-400/35 bg-violet-500/[0.12] text-violet-300"
              : "border-white/[0.07] bg-white/[0.03] text-[color:var(--t-tertiary)] hover:bg-white/[0.06] hover:text-[color:var(--t-primary)]"
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
      className="fixed bottom-[4.5rem] left-3 z-[9999] flex items-center gap-2 rounded-2xl border border-white/15 bg-zinc-900/80 px-3 py-2 text-[length:var(--fs-label)] font-semibold text-[color:var(--t-primary)] shadow-lg backdrop-blur-md transition hover:bg-zinc-800/90 active:scale-[0.97] max-md:bottom-[var(--mobile-overlay-bottom)]"
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
  const localsdrStatus = useMoonTransitStore((st) => st.localsdrStatus);
  const mapDisplayMode = useMoonTransitStore((st) => st.mapDisplayMode);
  const isWide = useIsMdUp();
  const [flightFilterCriteria, setFlightFilterCriteria] = useState<FlightFilterCriteria>({
    query: "",
    aircraftTypes: [],
  });
  const [railOpenId, setRailOpenId] = useState<PanelId | null>(null);
  const [mobileSheetId, setMobileSheetId] = useState<DockId | null>(null);
  const [greenDismissedAtCount, setGreenDismissedAtCount] = useState<number>(-1);

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

  const { subscribeToPush, supported: pushSupported } = usePushRegistration(s.alertsEnabled);
  const { latestAlert, clearAlert } = useCandidateAlerts({
    enabled: s.alertsEnabled,
    audioEnabled: s.alertsEnabled,
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

  /* ---- Green zone (shot-feasible) alert ---------------------------------- */
  const cameraFocalLengthMm = useMoonTransitStore((st) => st.cameraFocalLengthMm);
  const cameraSensorType = useMoonTransitStore((st) => st.cameraSensorType);
  const openSkyLatencySkewMsHPC = useMoonTransitStore((st) => st.openSkyLatencySkewMs);
  const feasibleFlightIds = useMemo(
    () =>
      computeShotFeasibleFlightIds(
        s.obs,
        s.moon,
        flights,
        Date.now(),
        openSkyLatencySkewMsHPC,
        cameraFocalLengthMm,
        cameraSensorType
      ),
    [s.obs, s.moon, flights, openSkyLatencySkewMsHPC, cameraFocalLengthMm, cameraSensorType]
  );
  const greenCount = feasibleFlightIds.size;
  const topGreenCallSign = useMemo(() => {
    if (feasibleFlightIds.size === 0) return null;
    const first = flights.find((f) => feasibleFlightIds.has(f.id));
    if (!first) return null;
    return first.callSign?.trim() || first.id;
  }, [feasibleFlightIds, flights]);
  const showGreenAlert =
    topGreenCallSign !== null && greenDismissedAtCount !== greenCount;

  const railBadges: Partial<Record<PanelId, number>> = useMemo(() => {
    const b: Partial<Record<PanelId, number>> = {};
    if (s.activeTransits.length > 0) b.active = s.activeTransits.length;
    if (s.candidatesDisplay.length > 0) b.candidates = s.candidatesDisplay.length;
    return b;
  }, [s.activeTransits.length, s.candidatesDisplay.length]);

  // Warning dot on the Flight source rail icon when the local SDR upstream is
  // down — visible even with the panel closed.
  const railWarn: Partial<Record<PanelId, boolean>> = useMemo(
    () =>
      s.liveFlightFeeds.localsdr && localsdrStatus === "unreachable"
        ? { flight: true }
        : {},
    [s.liveFlightFeeds.localsdr, localsdrStatus]
  );

  const dockBadges: Partial<Record<DockId, number>> = useMemo(() => {
    const b: Partial<Record<DockId, number>> = {};
    if (s.activeTransits.length > 0) b.active = s.activeTransits.length;
    if (s.candidatesDisplay.length > 0) b.candidates = s.candidatesDisplay.length;
    return b;
  }, [s.activeTransits.length, s.candidatesDisplay.length]);

  /* ---- Renderer panela (zajednički za rail i mobile sheet) -------------- */
  const renderPanel = useCallback(
    (id: PanelId | "more"): React.ReactNode => {
      if (id === "active") {
        return (
          <ActiveTransitsPanel
            rows={s.activeTransits}
            showEphemeris={s.showEphemeris}
            selectedFlightId={s.selectedFlightId}
            onSelectFlight={handleSelectFlightFromPanel}
            planningMode={s.isPlanned}
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
            cloudCoverPercent={s.cloudCoverPercent}
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
            onSelectFlight={handleSelectFlightFromPanel}
            alertsEnabled={s.alertsEnabled}
            onToggleAlerts={() => s.setAlertsEnabled((a) => !a)}
            onSubscribeToPush={subscribeToPush}
            planningMode={s.isPlanned}
            bestHours={s.bestHours}
            referenceEpochMs={s.referenceEpochMs}
            onSelectHour={s.onSelectPlanningHour}
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
                className="min-h-[48px] rounded-2xl border border-amber-500/35 bg-amber-500/[0.10] px-3 py-3 text-[length:var(--fs-meta)] font-semibold text-amber-200 shadow-[0_4px_16px_-8px_rgba(251,191,36,0.5)] transition hover:border-amber-400/55 hover:bg-amber-500/[0.16] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Set my location here
              </button>
              <button
                type="button"
                onClick={requestFocusOnObserver}
                className="min-h-[48px] rounded-2xl border border-sky-500/30 bg-sky-500/[0.08] px-3 py-3 text-[length:var(--fs-meta)] font-semibold text-sky-200 shadow-[0_4px_16px_-8px_rgba(96,165,250,0.45)] transition hover:border-sky-400/50 hover:bg-sky-500/[0.14] active:scale-[0.97]"
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
            liveFlightFeeds={s.liveFlightFeeds}
            onLiveFlightFeedsChange={s.setLiveFlightFeeds}
            providerFlightCounts={s.providerFlightCounts}
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
      if (id === "flightlog") {
        return <FlightLogPanel />;
      }
      // "more" — grid svih ostalih panela
      return <MoreToolsGrid onSelect={(panelId) => setMobileSheetId(panelId)} />;
    },
    [
      s,
      aircraftTypeFilterOptions,
      flightFilterCriteria,
      observerLocationLocked,
      requestFocusOnObserver,
      requestPlaceObserverFromView,
    ]
  );

  /* ---- Otvori specifičan panel iz alerta -------------------------------- */
  const openPhotoFromAlert = useCallback(() => {
    if (isWide) {
      setRailOpenId("photo");
    } else {
      setMobileSheetId("photo");
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
      <NotificationPermissionPrompt
        supported={pushSupported}
        onAllow={subscribeToPush}
      />
      {latestAlert && (
        <TransitAlertToast
          alert={latestAlert}
          onDismiss={clearAlert}
          onSelect={handleSelectFlightFromPanel}
        />
      )}

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
          {/* Top bar — unified glass header: brand | search (flex-1) | actions */}
          <header
            className="pointer-events-auto absolute inset-x-0 top-0 z-[20] flex items-center gap-3 border-b border-white/[0.09] bg-[rgba(14,18,42,0.85)] px-4 backdrop-blur-xl backdrop-saturate-150"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              height: "calc(3.5rem + env(safe-area-inset-top))",
            }}
          >
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
              onGps={s.onUseGps}
              gpsBusy={s.gpsBusy}
              observerLocked={observerLocationLocked}
            />
          </header>

          {/* Right rail */}
          <FloatingRail
            expandedId={railOpenId}
            onSelect={(id) =>
              setRailOpenId((prev) => (prev === id ? null : id))
            }
            onClose={() => setRailOpenId(null)}
            badges={railBadges}
            warnIds={railWarn}
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
            isPlanned={s.isPlanned}
            planningDateValue={s.planningDateValue}
            onPlanningDate={s.onPlanningDate}
          />

          {/* Green zone alert */}
          {showGreenAlert && topGreenCallSign ? (
            <GreenZoneAlert
              count={greenCount}
              callSign={topGreenCallSign}
              onOpen={openPhotoFromAlert}
              onDismiss={() => setGreenDismissedAtCount(greenCount)}
            />
          ) : null}
        </>
      ) : (
        /* === MOBILE UI === */
<>
          {/* Top bar — unified glass header, spojen na vrh ekrana */}
          <header
            className="pointer-events-auto absolute inset-x-0 top-0 z-[78] flex items-center gap-2 border-b border-white/[0.09] bg-[rgba(14,18,42,0.85)] px-3 backdrop-blur-xl backdrop-saturate-150"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              height: "calc(3.5rem + env(safe-area-inset-top))",
            }}
          >
            <BrandPill size="compact" />
            <div className="min-w-0 flex-1" />
            <WeatherOverlay />
            <div className="h-5 w-px shrink-0 bg-white/[0.12]" aria-hidden />
            <div
              className={`flex shrink-0 items-center gap-1 transition-opacity duration-200 ${
                s.selectedFlightId != null || mobileSheetId != null
                  ? "pointer-events-none opacity-0"
                  : ""
              }`}
              aria-hidden={s.selectedFlightId != null || mobileSheetId != null}
            >
              <button
                type="button"
                onClick={s.onUseGps}
                disabled={s.gpsBusy || observerLocationLocked}
                title="Use my GPS"
                aria-label="Use my GPS"
                className="grid h-9 w-9 place-items-center rounded-full text-emerald-300 transition hover:bg-emerald-500/15 active:scale-[0.95] disabled:opacity-40"
              >
                {s.gpsBusy ? (
                  <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                    <path d="M21 12a9 9 0 1 1-3.5-7.1" />
                  </svg>
                ) : (
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={requestPlaceObserverFromView}
                disabled={observerLocationLocked}
                title="Set location"
                aria-label="Set my location here"
                className="grid h-9 w-9 place-items-center rounded-full text-amber-300 transition hover:bg-amber-500/15 active:scale-[0.95] disabled:opacity-40"
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
                className="grid h-9 w-9 place-items-center rounded-full text-sky-300 transition hover:bg-sky-500/15 active:scale-[0.95]"
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
          </header>

          {/* Search bar — plutajući pill ispod headera, puna širina */}
          <div
            className="pointer-events-auto absolute inset-x-3 z-[77]"
            style={{ top: "calc(3.5rem + env(safe-area-inset-top) + 0.5rem)" }}
          >
            <CommandBar
              query={flightFilterCriteria.query}
              onChange={(next) =>
                setFlightFilterCriteria((prev) => ({ ...prev, query: next }))
              }
              resultCount={filteredFlightCount}
              widthClass="w-full"
              floating
            />
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
              isPlanned={s.isPlanned}
              planningDateValue={s.planningDateValue}
              onPlanningDate={s.onPlanningDate}
              compact
            />
          </div>

          {/* Green zone alert */}
          {showGreenAlert && topGreenCallSign ? (
            <GreenZoneAlert
              count={greenCount}
              callSign={topGreenCallSign}
              onOpen={openPhotoFromAlert}
              onDismiss={() => setGreenDismissedAtCount(greenCount)}
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

function getSheetMeta(id: DockId) {
  if (id === "more") return MORE_PANEL_META;
  return PANEL_BY_ID[id];
}

const ACCENT_DOT: Record<PanelAccent, string> = {
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
      className={`absolute inset-x-1.5 bottom-[calc(var(--mobile-dock-h)-0.25rem)] z-[75] flex max-h-[82dvh] flex-col overflow-hidden rounded-3xl border border-[color:var(--glass-stroke-strong)] bg-[color:var(--glass-3)] shadow-[0_-20px_64px_-12px_rgba(0,0,0,0.75)] backdrop-blur-2xl backdrop-saturate-150 transition-[height,transform] duration-300 motion-reduce:transition-none ${heightClass}`}
      aria-label={`${getSheetMeta(id).mobileTitle} controls`}
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
            className={`size-2 shrink-0 rounded-full shadow-[0_0_10px_currentColor] ${ACCENT_DOT[getSheetMeta(id).accent]}`}
          />
          <span className="truncate">{getSheetMeta(id).mobileTitle}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-full border border-white/[0.10] bg-white/[0.06] px-4 text-[length:var(--fs-meta)] font-semibold text-[color:var(--t-primary)] transition hover:border-white/20 hover:bg-white/[0.10] active:scale-[0.97]"
          aria-label="Close panel"
        >
          Done
        </button>
      </header>
      <div
        id="mobile-shell-sheet-panel"
        data-testid="mobile-deck-content"
        role="tabpanel"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-[color:var(--t-primary)] [scrollbar-gutter:stable]"
      >
        {children}
      </div>
    </section>
  );
}

/* ---------------- "More tools" grid (mobile) ------------------------------ */

/** Paneli koji nisu u primary docku — prikazuju se u "More" gridu. */
const MORE_PANELS = PANEL_REGISTRY.filter((p) => !p.dockPrimary);

const ACCENT_GRID_BTN: Record<PanelAccent, string> = {
  moon:   "border-amber-400/25 bg-amber-500/[0.07] hover:border-amber-400/45 hover:bg-amber-500/[0.12]",
  sky:    "border-sky-400/25 bg-sky-500/[0.07] hover:border-sky-400/45 hover:bg-sky-500/[0.12]",
  mint:   "border-emerald-400/25 bg-emerald-500/[0.07] hover:border-emerald-400/45 hover:bg-emerald-500/[0.12]",
  rose:   "border-rose-400/25 bg-rose-500/[0.07] hover:border-rose-400/45 hover:bg-rose-500/[0.12]",
  violet: "border-violet-400/25 bg-violet-500/[0.07] hover:border-violet-400/45 hover:bg-violet-500/[0.12]",
};

function MoreToolsGrid({ onSelect }: { onSelect: (id: PanelId) => void }) {
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
              <span className="text-[length:var(--fs-body)] font-semibold text-[color:var(--t-primary)]">
                {p.dockLabel}
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
        <span className="text-[length:var(--fs-body)] font-semibold text-[color:var(--t-primary)]">About / FAQ</span>
      </Link>
    </div>
  );
}
