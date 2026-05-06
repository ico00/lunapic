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
import { clampFloatingMenuLeft } from "@/lib/ui/clampFloatingMenuLeft";
import {
  shellAccentCheckboxClass,
  shellComboboxListboxPortalClass,
  shellComboboxTriggerClass,
} from "@/lib/ui/shellComboboxStyles";
import type { LiveFlightFeeds } from "@/stores/moon-transit-store";
import {
  FLIGHT_PROVIDER_COMBO_IDS,
  type FlightProviderId,
} from "@/types/flight-provider";

function labelForProvider(id: FlightProviderId): string {
  if (id === "mock") {
    return "Mock";
  }
  if (id === "static") {
    return "Routes (static)";
  }
  if (id === "adsbone") {
    return "ADS-B One (free API)";
  }
  return "OpenSky (ADS-B)";
}

function triggerLabel(
  value: FlightProviderId,
  liveFlightFeeds: LiveFlightFeeds
): string {
  if (value !== "opensky" && value !== "adsbone") {
    return labelForProvider(value);
  }
  if (liveFlightFeeds.opensky && liveFlightFeeds.adsbone) {
    return "OpenSky + ADS-B One (merged)";
  }
  if (liveFlightFeeds.opensky) {
    return labelForProvider("opensky");
  }
  return labelForProvider("adsbone");
}

type FlightProviderSelectProps = {
  value: FlightProviderId;
  liveFlightFeeds: LiveFlightFeeds;
  onLiveFlightFeedsChange: (patch: Partial<LiveFlightFeeds>) => void;
};

/**
 * Combobox (portal): samo **OpenSky** i **ADS-B One** kao checkbox redovi
 * (`static` / `mock` nisu u izborniku).
 */
export function FlightProviderSelect({
  value,
  liveFlightFeeds,
  onLiveFlightFeedsChange,
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

  const buttonText = triggerLabel(value, liveFlightFeeds);

  const optionRowBase =
    "cursor-pointer select-none rounded-md px-2.5 py-1.5 text-left text-sm outline-none";
  const liveRowClass = (feedOn: boolean) =>
    feedOn
      ? `${optionRowBase} bg-blue-500/20 text-yellow-400`
      : `${optionRowBase} text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50 focus:bg-zinc-900`;

  const listbox =
    open && pos && hasMounted ? (
      <ul
        ref={menuRef}
        id={listboxId}
        data-testid="flight-provider-menu"
        role="listbox"
        aria-label="Flight data provider"
        className={shellComboboxListboxPortalClass}
        style={{
          top: pos.top,
          left: pos.left,
          minWidth: pos.width,
          width: "max-content",
          maxWidth: "min(calc(100vw - 1rem), 22rem)",
        }}
      >
        {FLIGHT_PROVIDER_COMBO_IDS.map((id) => {
          const feedOn =
            id === "opensky"
              ? liveFlightFeeds.opensky
              : liveFlightFeeds.adsbone;
          return (
            <li
              key={id}
              role="presentation"
              className={liveRowClass(feedOn)}
              onMouseDown={(e) => e.preventDefault()}
            >
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  data-testid={
                    id === "opensky"
                      ? "live-feed-opensky"
                      : "live-feed-adsbone"
                  }
                  checked={feedOn}
                  onChange={(e) => {
                    if (id === "opensky") {
                      onLiveFlightFeedsChange({
                        opensky: e.target.checked,
                      });
                    } else {
                      onLiveFlightFeedsChange({
                        adsbone: e.target.checked,
                      });
                    }
                  }}
                  className={shellAccentCheckboxClass}
                />
                <span className="min-w-0 flex-1 select-none">
                  {labelForProvider(id)}
                </span>
              </label>
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
        className={shellComboboxTriggerClass}
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
        <span className="min-w-0 flex-1 truncate">{buttonText}</span>
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
