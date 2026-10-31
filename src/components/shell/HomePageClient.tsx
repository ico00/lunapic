"use client";

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
import { PlanningPanel } from "@/components/shell/panels/PlanningPanel";
import { TransitCandidatesPanel } from "@/components/shell/panels/TransitCandidatesPanel";
import { TransitForecastPanel } from "@/components/shell/panels/TransitForecastPanel";
import { MobileMoreList, MobileSheet, MobileTabBar, type MobileView } from "@/components/shell/MobileShell";
import { MoonTimeLine } from "@/components/shell/MoonTimeLine";
import { NextTransitBoard } from "@/components/shell/NextTransitBoard";
import { ToolRail, ToolSheet } from "@/components/shell/ToolRail";
import { FlightAltitudeLegend } from "@/components/map/FlightAltitudeLegend";
import { MapDisplayModeLayersControl } from "@/components/map/MapDisplayModeLayersControl";
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
import { PANEL_BY_ID, type PanelId } from "@/components/shell/panelRegistry";
import { resumeSharedAudioFromUserGesture } from "@/lib/audio/fieldAudio";
import { appPath } from "@/lib/paths/appPath";
import {
  type FlightFilterCriteria,
  uniqueAircraftTypeFilterOptions,
  filterFlightsByCriteria,
} from "@/lib/flight/flightSearch";
import { useObserverStore } from "@/stores/observer-store";
import type { GroundObserver } from "@/types/geo";
import type { LiveFlightFeeds } from "@/stores/moon-transit-store";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useTransitComputedStore } from "@/stores/transit-computed-store";
import type { MapContainerProps } from "@/components/map/MapContainer";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* =============================================================================
   Transit dijagram (spec §2b): karta preko cijelog viewporta, sve ostalo su
   ravne neprozirne plohe iznad nje.
   - Desktop: gornja traka, lijevi izbornik s 5 grupa, ploča "Next transit" ili
              otvoreni panel na istom mjestu, vremenska traka dolje.
   - Telefon: gornja traka; iznad donje trake su uska ploča, Layers + legenda
              visine i vremenska traka; četiri panela su na jedan dodir, ostalo
              je u popisu "More" (`MobileShell`).
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
      className="pointer-events-auto inline-flex shrink-0 items-center gap-2.5 rounded-[var(--r-ctl)] px-1 py-1 transition hover:opacity-80 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"
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
      <span className={`mt-title shrink-0 leading-none tracking-tight ${isCompact ? "text-[length:var(--fs-h2)] max-[380px]:hidden" : "text-[length:var(--fs-body-strong)]"}`}>
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
    <div className={`pointer-events-auto flex h-[38px] items-center gap-2.5 rounded-[var(--r-ctl)] border px-3 transition-[border-color] duration-150 focus-within:border-[color:var(--observer)] ${floating ? "mt-glass-elevated border-[color:var(--hair)]" : "border-[color:var(--hair)] bg-[color:var(--panel)]"} ${widthClass}`}>
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
        className="flex-1 min-w-0 bg-transparent text-[length:var(--fs-body)] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-3)] max-md:text-[16px]"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {hasQuery && resultCount !== null && (
        <span className="shrink-0 rounded-full bg-[color:var(--observer)] px-2 py-0.5 text-[length:var(--fs-label)] font-extrabold text-[#06143a]">
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
        <span className="hidden shrink-0 rounded-[4px] border border-[color:var(--hair)] px-2 py-0.5 text-[length:var(--fs-label)] text-[color:var(--ink-3)] md:inline-block">
          ⌘K
        </span>
      )}
    </div>
  );
}

function formatCoord(value: number, pos: string, neg: string): string {
  return `${Math.abs(value).toFixed(3)}° ${value >= 0 ? pos : neg}`;
}

const FEED_NAMES: readonly [keyof LiveFlightFeeds, string][] = [
  ["localsdr", "LunaPic ADS-B"],
  ["avionix", "Avionix"],
  ["adsbone", "adsb.lol"],
  ["opensky", "OpenSky"],
];

function feedsSummary(feeds: LiveFlightFeeds): string {
  const on = FEED_NAMES.filter(([id]) => feeds[id]).map(([, name]) => name);
  return on.length === 0 ? "No flight source" : on.join(" + ");
}

/* ---------------- Weather + actions (top right) ---------------------------- */

function TopRightCluster({
  onPlace,
  onFocus,
  onGps,
  gpsBusy,
  observerLocked,
  observer,
  feedsLabel,
}: {
  onPlace: () => void;
  onFocus: () => void;
  onGps: () => void;
  gpsBusy: boolean;
  observerLocked: boolean;
  observer: GroundObserver;
  feedsLabel: string;
}) {
  return (
    <div className="pointer-events-auto flex shrink-0 items-center gap-1">
      <div
        className="mr-1 hidden h-[38px] items-center gap-2 rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--panel)] px-3 text-[length:var(--fs-meta)] font-semibold text-[color:var(--ink-2)] xl:flex"
        title="Observer position and ground height"
      >
        <span className="size-2.5 shrink-0 rounded-full border-[2.5px] border-[color:var(--observer)]" aria-hidden />
        <span>
          <b className="font-extrabold text-[color:var(--ink)]">
            {formatCoord(observer.lat, "N", "S")} {formatCoord(observer.lng, "E", "W")}
          </b>
          {observer.groundHeightMeters != null ? ` · ${Math.round(observer.groundHeightMeters)} m` : ""}
        </span>
      </div>
      <WeatherOverlay />
      <div
        className="ml-1 hidden h-[38px] items-center gap-2 rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--panel)] px-3 text-[length:var(--fs-meta)] font-semibold text-[color:var(--ink-2)] 2xl:flex"
        title="Flight sources in use"
      >
        <span className="size-2 shrink-0 rounded-full bg-[color:var(--live)]" aria-hidden />
        {feedsLabel}
      </div>
      <div className="mx-2 h-5 w-px shrink-0 bg-[color:var(--hair)]" aria-hidden />
      <button
        type="button"
        onClick={onGps}
        disabled={gpsBusy || observerLocked}
        title="Use my GPS"
        aria-label="Use my GPS — set observer to device location"
        className="grid h-9 w-9 place-items-center rounded-[var(--r-ctl)] text-[color:var(--ink-2)] transition-[background-color,color,transform] duration-150 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel)] [@media(hover:hover)_and_(pointer:fine)]:hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
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
        className="grid h-9 w-9 place-items-center rounded-[var(--r-ctl)] text-[color:var(--ink-2)] transition-[background-color,color,transform] duration-150 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel)] [@media(hover:hover)_and_(pointer:fine)]:hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
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
        className="grid h-9 w-9 place-items-center rounded-[var(--r-ctl)] text-[color:var(--ink-2)] transition-[background-color,color,transform] duration-150 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel)] [@media(hover:hover)_and_(pointer:fine)]:hover:text-[color:var(--ink)]"
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

/* ---------------- Time ribbon (bottom) ------------------------------------- */

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
  // Snapshot pri mountu — popup se otvara svježe svaki put, ne treba live-tick.
  const [openedAtMs] = useState(() => Date.now());
  const todayMs = localMidnightMs(openedAtMs);
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
      className={`rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)] ${
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
          className="grid h-[42px] w-[42px] place-items-center rounded-[var(--r-ctl)] text-[color:var(--ink-2)] transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel-2)] disabled:opacity-30"
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
            className="grid h-[42px] w-[42px] place-items-center rounded-[var(--r-ctl)] text-[color:var(--ink-2)] transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel-2)]"
            aria-label="Next month"
          >
            ›
          </button>
          {!isMdUp && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-[42px] w-[42px] place-items-center rounded-[var(--r-ctl)] text-[color:var(--ink-2)] transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel-2)]"
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
              className={`mx-auto grid ${dayCellClass} place-items-center rounded-full text-[length:var(--fs-meta)] font-semibold transition-colors duration-150 ${
                isSelected
                  ? "bg-[color:var(--observer)] font-extrabold text-[#06143a]"
                  : isToday
                    ? "border-2 border-[color:var(--live)] text-[color:var(--ink)]"
                    : isPast
                      ? "text-[color:var(--t-disabled)]"
                      : "text-[color:var(--ink-2)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel-2)]"
              }`}
              aria-label={`${dd}/${mm}/${viewYear}`}
              aria-pressed={isSelected}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p className="mt-2 border-t border-[color:var(--hair-soft)] pt-2 text-center text-[length:var(--fs-meta)] leading-snug text-[color:var(--ink-3)]">
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
      <div className="fixed inset-0 z-[280] flex items-center justify-center bg-[color:var(--ground-deep)]/80 p-4">
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
  const [btnEl, setBtnEl] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={setBtnEl}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex shrink-0 items-center justify-center gap-2 rounded-[var(--r-ctl)] border text-[length:var(--fs-body)] font-semibold transition-[border-color,transform] duration-150 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] ${props.sizeClass} ${
          props.isPlanned
            ? "border-[color:var(--observer)] bg-[color:var(--panel-2)] text-[color:var(--observer-text)]"
            : "border-[color:var(--hair)] bg-[color:var(--panel-2)] text-[color:var(--ink)] [@media(hover:hover)_and_(pointer:fine)]:hover:border-[color:var(--ink-3)]"
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
      {open && btnEl && (
        <PlanningCalendarPopup
          anchor={btnEl}
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

function SyncIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
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
  );
}

function TimeRibbon(props: {
  referenceEpochMs: number;
  offsetHours: number;
  onOffsetHours: (hours: number) => void;
  showEphemeris: boolean;
  isMoonBelowHorizon: boolean;
  sliderWidthHours: number;
  syncTime: () => void;
  isPlanned: boolean;
  planningDateValue: string;
  onPlanningDate: (value: string) => void;
  anchorMs: number;
  observer: GroundObserver;
  /** Telefon: niska traka bez oznaka stanica, u stupcu iznad donje trake. */
  compact?: boolean;
}) {
  const mounted = useHasMounted();
  // Desktop: vrijeme kao linija sa stanicama (spec §2b.4).
  const at = new Date(props.referenceEpochMs);
  const clock = mounted && props.showEphemeris
    ? at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";
  const dateLabel = mounted && props.showEphemeris
    ? `${at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}${
        props.isPlanned ? " · planned" : props.offsetHours < 0.05 ? " · now" : ""
      }`
    : "";
  const now = (
    <>
      <span className="text-[length:var(--fs-h1)] font-extrabold leading-none" suppressHydrationWarning>
        {clock}
      </span>
      <span className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]" suppressHydrationWarning>
        {dateLabel}
      </span>
    </>
  );
  const line = (
    <MoonTimeLine
      anchorMs={props.anchorMs}
      widthHours={props.sliderWidthHours}
      offsetHours={props.offsetHours}
      onOffsetHours={props.onOffsetHours}
      showEphemeris={props.showEphemeris}
      isMoonBelowHorizon={props.isMoonBelowHorizon}
      observer={props.observer}
    />
  );
  if (props.compact) {
    const moved = props.isPlanned || props.offsetHours >= 0.05;
    return (
      <div className="mt-glass-elevated pointer-events-auto flex h-14 shrink-0 items-center overflow-hidden rounded-[var(--r-panel)]">
        <div className="flex w-[74px] shrink-0 flex-col justify-center gap-0.5 self-stretch border-r border-[color:var(--hair-soft)] pl-3">
          <span
            className={`text-[length:var(--fs-h2)] font-extrabold leading-none ${moved ? "text-[color:var(--observer-text)]" : ""}`}
            suppressHydrationWarning
          >
            {clock}
          </span>
          <span className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]" suppressHydrationWarning>
            {mounted && props.showEphemeris
              ? moved
                ? at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })
                : "Now"
              : ""}
          </span>
        </div>
        <MoonTimeLine
          dense
          anchorMs={props.anchorMs}
          widthHours={props.sliderWidthHours}
          offsetHours={props.offsetHours}
          onOffsetHours={props.onOffsetHours}
          showEphemeris={props.showEphemeris}
          isMoonBelowHorizon={props.isMoonBelowHorizon}
          observer={props.observer}
        />
        <div className="flex shrink-0 items-center gap-1 pr-1.5">
          <PlanningDateButton
            isPlanned={props.isPlanned}
            planningDateValue={props.planningDateValue}
            onPlanningDate={props.onPlanningDate}
            sizeClass="h-[42px] w-[42px]"
            iconClass="h-5 w-5"
          />
          <button
            type="button"
            onClick={props.syncTime}
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[var(--r-ctl)] border border-[color:var(--live)] text-[color:var(--live)] transition-transform duration-150 active:scale-[0.95]"
            title="Sync time to now"
            aria-label="Sync time to now"
          >
            <SyncIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-glass-elevated pointer-events-auto absolute z-[14] left-[216px] right-[5.5rem] bottom-3 flex h-[76px] items-stretch overflow-hidden rounded-[var(--r-panel)]">
      <div className="flex min-w-[132px] flex-col justify-center gap-0.5 border-r border-[color:var(--hair-soft)] px-4">
        {now}
      </div>
      {line}
      <div className="flex items-center gap-2 border-l border-[color:var(--hair-soft)] px-3">
        <PlanningDateButton
          isPlanned={props.isPlanned}
          planningDateValue={props.planningDateValue}
          onPlanningDate={props.onPlanningDate}
          sizeClass="h-[42px] w-[42px]"
          iconClass="h-5 w-5"
        />
        <button
          type="button"
          onClick={props.syncTime}
          className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[var(--r-ctl)] border border-[color:var(--live)] text-[color:var(--live)] transition-[background-color,transform] duration-150 active:scale-[0.95] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--mint-soft)]"
          title="Sync time to now"
          aria-label="Sync time to now"
        >
          <SyncIcon className="h-5 w-5" />
        </button>
      </div>
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
      className={`mt-note mt-note-live pointer-events-auto absolute z-[17] ${
        compact
          ? "inset-x-2 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)]"
          : "right-[6.5rem] bottom-[16rem] w-[320px]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 text-[length:var(--fs-meta)] font-bold text-[color:var(--live)]">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-[color:var(--live)]" />
          In shot zone · {count}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss green zone alert"
          className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-ctl)] text-[color:var(--ink-2)] transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:text-[color:var(--ink)]"
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
      <button type="button" onClick={onOpen} className="mt-1 block w-full text-left">
        <h4 className="text-[length:var(--fs-h1)] font-extrabold text-[color:var(--ink)]">
          {callSign}
        </h4>
        <p className="mt-0.5 text-[length:var(--fs-meta)] leading-snug text-[color:var(--ink-2)]">
          Aircraft in optimal photo range. Tap to open Photographer.
        </p>
      </button>
    </div>
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
      className="mt-btn fixed bottom-[4.5rem] left-3 z-[9999] max-md:bottom-auto max-md:left-2 max-md:top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)]"
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
  const timeAnchorMs = useMoonTransitStore((st) => st.timeAnchorMs);
  const isWide = useIsMdUp();
  const [flightFilterCriteria, setFlightFilterCriteria] = useState<FlightFilterCriteria>({
    query: "",
    aircraftTypes: [],
  });
  const [railOpenId, setRailOpenId] = useState<PanelId | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>(null);
  const [boardInsetPx, setBoardInsetPx] = useState(0);
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
        setMobileView(null);
      }
    },
    [s, isWide]
  );

  /* ---- Green zone (shot-feasible) alert ---------------------------------- */
  const feasibleFlightIds = useTransitComputedStore((st) => st.shotFeasibleFlightIds);
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

  const onMobileTab = useCallback((id: PanelId | "more") => {
    setMobileView((prev) => (prev === id ? null : id));
  }, []);

  // Karta na telefonu: promatrač ostaje iznad traka, ne ispod njih (spec §2b.7).
  const boardRoRef = useRef<ResizeObserver | null>(null);
  const boardWrapRef = useCallback((el: HTMLDivElement | null) => {
    boardRoRef.current?.disconnect();
    boardRoRef.current = null;
    if (!el) return;
    const measure = () => {
      const height = el.getBoundingClientRect().height;
      const fromBottom = window.innerHeight - el.getBoundingClientRect().top;
      // Sitne promjene visine ne smiju micati kartu.
      setBoardInsetPx(height > 0 ? Math.round(fromBottom / 24) * 24 : 0);
    };
    measure();
    boardRoRef.current = new ResizeObserver(measure);
    boardRoRef.current.observe(el);
  }, []);

  /* ---- Renderer panela (zajednički za rail i mobile sheet) -------------- */
  const renderPanel = useCallback(
    (id: PanelId): React.ReactNode => {
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
                className="mt-btn text-[length:var(--fs-meta)]"
              >
                Set my location here
              </button>
              <button
                type="button"
                onClick={requestFocusOnObserver}
                className="mt-btn text-[length:var(--fs-meta)]"
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
      if (id === "forecast") {
        return <TransitForecastPanel />;
      }
      return <PlanningPanel />;
    },
    [
      s,
      aircraftTypeFilterOptions,
      flightFilterCriteria,
      observerLocationLocked,
      requestFocusOnObserver,
      requestPlaceObserverFromView,
      handleSelectFlightFromPanel,
      subscribeToPush,
    ]
  );

  /* ---- Otvori specifičan panel iz alerta -------------------------------- */
  const openPhotoFromAlert = useCallback(() => {
    if (isWide) {
      setRailOpenId("photo");
    } else {
      setMobileView("photo");
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
          suppressSelectedAircraftPopup={!isWide && mobileView != null}
          mobileBottomInsetPx={!isWide ? boardInsetPx : 0}
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
            className="pointer-events-auto absolute inset-x-0 top-0 z-[20] flex items-center gap-3 border-b border-[color:var(--hair)] bg-[color:var(--ground)] px-4"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              height: "calc(3.5rem + env(safe-area-inset-top))",
            }}
          >
            <BrandPill />
            <div className="ml-6 flex min-w-0 flex-1 justify-start">
              <CommandBar
                query={flightFilterCriteria.query}
                onChange={(next) =>
                  setFlightFilterCriteria((prev) => ({ ...prev, query: next }))
                }
                resultCount={filteredFlightCount}
                widthClass="w-full max-w-[460px]"
              />
            </div>
            <TopRightCluster
              onPlace={requestPlaceObserverFromView}
              onFocus={requestFocusOnObserver}
              onGps={s.onUseGps}
              gpsBusy={s.gpsBusy}
              observerLocked={observerLocationLocked}
              observer={s.obs}
              feedsLabel={feedsSummary(s.liveFlightFeeds)}
            />
          </header>

          {/* Lijevi izbornik + ploča (spec §2b.5) */}
          <ToolRail
            activeId={railOpenId}
            onSelect={(id) =>
              setRailOpenId((prev) => (prev === id ? null : id))
            }
            badges={railBadges}
            warnIds={railWarn}
          />
          {railOpenId ? (
            <ToolSheet
              item={PANEL_BY_ID[railOpenId]}
              onClose={() => setRailOpenId(null)}
            >
              {renderPanel(railOpenId)}
            </ToolSheet>
          ) : (
            <NextTransitBoard
              candidates={s.candidatesDisplay}
              selectedFlightId={s.selectedFlightId}
              onSelectFlight={handleSelectFlightFromPanel}
              observer={s.obs}
              moon={s.transitBoardMoon}
              showEphemeris={s.showEphemeris}
              isPlanned={s.isPlanned}
              watchedFlightCount={flights.length}
              onOpenCandidates={() => setRailOpenId("candidates")}
            />
          )}

          {/* Time ribbon dolje */}
          <TimeRibbon
            referenceEpochMs={s.referenceEpochMs}
            offsetHours={s.offsetHours}
            onOffsetHours={s.setOffsetHours}
            showEphemeris={s.showEphemeris}
            isMoonBelowHorizon={s.isMoonBelowHorizon}
            sliderWidthHours={s.sliderWidthHours}
            syncTime={handleSyncTime}
            isPlanned={s.isPlanned}
            planningDateValue={s.planningDateValue}
            onPlanningDate={s.onPlanningDate}
            anchorMs={timeAnchorMs}
            observer={s.obs}
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
          <header
            className="pointer-events-auto absolute inset-x-0 top-0 z-[78] flex items-center gap-2 border-b border-[color:var(--hair)] bg-[color:var(--ground)] px-3"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              height: "calc(3.5rem + env(safe-area-inset-top))",
            }}
          >
            <BrandPill size="compact" />
            <CommandBar
              query={flightFilterCriteria.query}
              onChange={(next) =>
                setFlightFilterCriteria((prev) => ({ ...prev, query: next }))
              }
              resultCount={filteredFlightCount}
              widthClass="min-w-0 flex-1"
            />
            <WeatherOverlay />
          </header>

          {/* Promatrač na jedan dodir (Mapbox zoom je ispod, globals.css). */}
          <div
            className="pointer-events-auto absolute right-2 z-[14] flex flex-col gap-1"
            style={{ top: "calc(3.5rem + env(safe-area-inset-top) + 0.5rem)" }}
          >
            <button
              type="button"
              onClick={s.onUseGps}
              disabled={s.gpsBusy || observerLocationLocked}
              aria-label="Use my GPS"
              title="Use my GPS"
              className="mt-toolbar-btn !h-[42px] !w-[42px]"
            >
              {s.gpsBusy ? (
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-3.5-7.1" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
              aria-label="Set my location here"
              title="Set my location here"
              className="mt-toolbar-btn !h-[42px] !w-[42px]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 22s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={requestFocusOnObserver}
              aria-label="Focus on me"
              title="Focus on me"
              className="mt-toolbar-btn !h-[42px] !w-[42px]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
              </svg>
            </button>
          </div>

          {showGreenAlert && topGreenCallSign ? (
            <GreenZoneAlert
              count={greenCount}
              callSign={topGreenCallSign}
              onOpen={openPhotoFromAlert}
              onDismiss={() => setGreenDismissedAtCount(greenCount)}
              compact
            />
          ) : null}

          {/* Trake iznad donje trake. Dok je avion odabran, njegova kartica sjeda
              na mjesto ploče i legende; `invisible` čuva visinu, pa se karta ne miče. */}
          <div
            ref={boardWrapRef}
            className="pointer-events-none absolute inset-x-2 bottom-[var(--mobile-overlay-bottom)] z-[15] flex flex-col gap-2"
          >
            <div className={`flex flex-col gap-2 ${s.selectedFlightId != null ? "invisible" : ""}`}>
              <NextTransitBoard
                variant="strip"
                onExpand={() => setMobileView("board")}
                candidates={s.candidatesDisplay}
                selectedFlightId={s.selectedFlightId}
                onSelectFlight={handleSelectFlightFromPanel}
                observer={s.obs}
                moon={s.transitBoardMoon}
                showEphemeris={s.showEphemeris}
                isPlanned={s.isPlanned}
                watchedFlightCount={flights.length}
                onOpenCandidates={() => setMobileView("candidates")}
              />
              <div className="flex items-stretch gap-2">
                <MapDisplayModeLayersControl />
                <FlightAltitudeLegend />
              </div>
            </div>
            <TimeRibbon
              compact
              referenceEpochMs={s.referenceEpochMs}
              offsetHours={s.offsetHours}
              onOffsetHours={s.setOffsetHours}
              showEphemeris={s.showEphemeris}
              isMoonBelowHorizon={s.isMoonBelowHorizon}
              sliderWidthHours={s.sliderWidthHours}
              syncTime={handleSyncTime}
              isPlanned={s.isPlanned}
              planningDateValue={s.planningDateValue}
              onPlanningDate={s.onPlanningDate}
              anchorMs={timeAnchorMs}
              observer={s.obs}
            />
          </div>

          {mobileView ? (
            <MobileSheet
              view={mobileView}
              onBack={() => setMobileView("more")}
              onClose={() => setMobileView(null)}
            >
              {mobileView === "more" ? (
                <MobileMoreList onOpen={setMobileView} warnIds={railWarn} />
              ) : mobileView === "board" ? (
                <NextTransitBoard
                  variant="sheet"
                  candidates={s.candidatesDisplay}
                  selectedFlightId={s.selectedFlightId}
                  onSelectFlight={handleSelectFlightFromPanel}
                  observer={s.obs}
                  moon={s.transitBoardMoon}
                  showEphemeris={s.showEphemeris}
                  isPlanned={s.isPlanned}
                  watchedFlightCount={flights.length}
                  onOpenCandidates={() => setMobileView("candidates")}
                />
              ) : (
                renderPanel(mobileView)
              )}
            </MobileSheet>
          ) : null}

          <MobileTabBar
            view={mobileView}
            onSelect={onMobileTab}
            badges={railBadges}
            warnMore={railWarn.flight === true}
          />
        </>
      )}
    </div>
  );
}
