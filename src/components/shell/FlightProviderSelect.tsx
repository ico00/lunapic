"use client";

import { createPortal } from "react-dom";
import {
  Fragment,
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
  shellComboboxOptionClass,
  shellComboboxTriggerClass,
} from "@/lib/ui/shellComboboxStyles";
import type { LiveFlightFeeds } from "@/stores/moon-transit-store";
import {
  FLIGHT_PROVIDER_COMBO_IDS,
  type FlightProviderId,
} from "@/types/flight-provider";

function labelForProvider(id: FlightProviderId): string {
  if (id === "mock") return "Mock";
  if (id === "static") return "Routes (static)";
  if (id === "adsbone") return "adsb.lol (free API)";
  if (id === "localsdr") return "LunaPic ADS-B";
  if (id === "avionix") return "Avionix Nano";
  return "OpenSky (ADS-B)";
}

/** Prikazni naziv za jedan lokalni izvor unutar `triggerLabel` kombinacija. */
const LOCAL_SOURCE_SHORT_LABEL: Record<"localsdr" | "avionix", string> = {
  localsdr: "LunaPic",
  avionix: "Avionix",
};

function triggerLabel(
  value: FlightProviderId,
  liveFlightFeeds: LiveFlightFeeds
): string {
  if (value !== "opensky" && value !== "adsbone") {
    return labelForProvider(value);
  }
  // S dva neovisna lokalna izvora kombinatorika (do 3 web stanja × do 4
  // lokalne kombinacije) više nije čitljiva kao literalni ternary lanac —
  // sastavi label iz aktivnih dijelova, fiksnim prioritetnim redoslijedom.
  const localLabels = (["avionix", "localsdr"] as const)
    .filter((id) => liveFlightFeeds[id])
    .map((id) => LOCAL_SOURCE_SHORT_LABEL[id]);
  const webLabel =
    liveFlightFeeds.opensky && liveFlightFeeds.adsbone
      ? "OpenSky + adsb.lol (merged)"
      : liveFlightFeeds.opensky
        ? labelForProvider("opensky")
        : labelForProvider("adsbone");
  return [...localLabels, webLabel].join(" + ");
}

type FlightProviderSelectProps = {
  value: FlightProviderId;
  liveFlightFeeds: LiveFlightFeeds;
  onLiveFlightFeedsChange: (patch: Partial<LiveFlightFeeds>) => void;
};

/**
 * Combobox (portal): samo **OpenSky** i **adsb.lol** kao checkbox redovi
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

  const liveRowClass = (feedOn: boolean) => shellComboboxOptionClass(feedOn);

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
          const isLocalSource = id === "localsdr" || id === "avionix";
          const feedOn =
            id === "opensky"
              ? liveFlightFeeds.opensky
              : id === "adsbone"
                ? liveFlightFeeds.adsbone
                : id === "localsdr"
                  ? liveFlightFeeds.localsdr
                  : liveFlightFeeds.avionix;
          return (
            <Fragment key={id}>
              {id === "localsdr" && (
                <li
                  role="separator"
                  aria-hidden
                  className="mx-2 my-1 border-t border-zinc-700/60"
                />
              )}
              <li
                role="presentation"
                className={liveRowClass(feedOn)}
                onMouseDown={(e) => e.preventDefault()}
              >
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid={`live-feed-${id}`}
                    checked={feedOn}
                    onChange={(e) => {
                      onLiveFlightFeedsChange(
                        id === "opensky"
                          ? { opensky: e.target.checked }
                          : id === "adsbone"
                            ? { adsbone: e.target.checked }
                            : id === "localsdr"
                              ? { localsdr: e.target.checked }
                              : { avionix: e.target.checked }
                      );
                    }}
                    className={shellAccentCheckboxClass}
                  />
                  <span className="min-w-0 flex-1 select-none">
                    {labelForProvider(id)}
                  </span>
                  {isLocalSource && feedOn && (
                    <span className="ml-1 shrink-0 text-[length:var(--fs-label)] text-[color:var(--t-tertiary)]">
                      ↑ priority
                    </span>
                  )}
                </label>
              </li>
            </Fragment>
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
          className={`h-4 w-4 shrink-0 text-[color:var(--t-tertiary)] transition ${open ? "rotate-180" : ""}`}
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
