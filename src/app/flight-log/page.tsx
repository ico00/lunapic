"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PageTopBar } from "@/components/shell/PageTopBar";
import type { AircraftListRow } from "@/lib/db/flightLogDb";
import { applyEnamelBasemap } from "@/lib/map/enamelBasemap";
import { appPath } from "@/lib/paths/appPath";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatsData {
  total: number;
  last24h: number;
  uniqueIcao: number;
  topCallsigns: { callsign: string; count: number }[];
}

interface LoadedTrack {
  icao24: string;
  callsign: string | null;
  color: string;
  geojson: object;
  pointCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const PAGE_SIZE = 50;
/** Serije podataka (spec §2b.2): tokeni `--s1…3`; Mapbox ne čita CSS varijable. */
const TRACK_COLORS = ["#5b95ff", "#34d17f", "#eef3fa"] as const;
const RANGE_OPTS = [
  { days: 1, label: "24 h" },
  { days: 7, label: "7 d" },
  { days: 30, label: "30 d" },
  { days: 90, label: "90 d" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
}

function fmtNumber(n: number): string {
  return n.toLocaleString("en-GB");
}

function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Prikazni naziv za `aircraft.source` — koji je lokalni prijemnik zadnji upisao ovaj zapis. */
function sourceLabel(source: string | null): string {
  if (source === "localsdr") return "LunaPic ADS-B";
  if (source === "avionix") return "Avionix Nano";
  return source ?? "";
}

// ---------------------------------------------------------------------------
// FlightLogMap component
// ---------------------------------------------------------------------------

function FlightLogMap({ tracks }: { tracks: LoadedTrack[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [16, 44],
      zoom: 5,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      applyEnamelBasemap(map);
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set(tracks.map((t) => t.icao24));

    // Remove layers/sources for deselected aircraft. Match on the line layer but
    // tear down ALL layers bound to the source (line, dot) before removing the
    // source — Mapbox throws if a source is removed while any layer uses it.
    const style = map.getStyle();
    for (const layer of style?.layers ?? []) {
      if (!layer.id.startsWith("fllog-line-")) continue;
      const id = layer.id.replace("fllog-line-", "");
      if (!activeIds.has(id)) {
        for (const lid of [`fllog-line-${id}`, `fllog-dot-${id}`]) {
          if (map.getLayer(lid)) map.removeLayer(lid);
        }
        if (map.getSource(`fllog-src-${id}`)) map.removeSource(`fllog-src-${id}`);
      }
    }

    // Add/update layers for active tracks
    for (const track of tracks) {
      const srcId = `fllog-src-${track.icao24}`;
      const layId = `fllog-line-${track.icao24}`;
      const dotId = `fllog-dot-${track.icao24}`;

      if (map.getSource(srcId)) {
        (map.getSource(srcId) as mapboxgl.GeoJSONSource).setData(
          track.geojson as Parameters<mapboxgl.GeoJSONSource["setData"]>[0]
        );
      } else {
        map.addSource(srcId, {
          type: "geojson",
          data: track.geojson as Parameters<mapboxgl.GeoJSONSource["setData"]>[0],
        });

        map.addLayer({
          id: layId,
          type: "line",
          source: srcId,
          paint: {
            "line-color": track.color,
            "line-width": 4,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });

        // Start dot
        map.addLayer({
          id: dotId,
          type: "circle",
          source: srcId,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 6,
            "circle-color": "#0b1530",
            "circle-stroke-color": track.color,
            "circle-stroke-width": 3,
          },
        });

        // Hover popup
        map.on("mouseenter", layId, (e) => {
          map.getCanvas().style.cursor = "pointer";
          popupRef.current?.remove();
          const feat = e.features?.[0];
          const props = feat?.properties as { icao24?: string; count?: number; callsign?: string } | undefined;
          const html = `
            <div style="font-size:12px;line-height:1.5;color:#eef3fa">
              <div style="font-weight:800">${track.callsign ?? track.icao24.toUpperCase()}</div>
              <div style="color:#8a9abd">${track.icao24.toUpperCase()}</div>
              <div style="margin-top:4px">${fmtNumber(props?.count ?? track.pointCount)} fixes</div>
            </div>`;
          popupRef.current = new mapboxgl.Popup({
            closeButton: false,
            offset: 8,
            className: "fllog-popup",
          })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        });

        map.on("mouseleave", layId, () => {
          map.getCanvas().style.cursor = "";
          popupRef.current?.remove();
          popupRef.current = null;
        });
      }
    }

    // Fit bounds to all tracks when there's at least one
    if (tracks.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasCoords = false;
      for (const track of tracks) {
        const fc = track.geojson as { features?: { geometry?: { coordinates?: [number, number][] } }[] };
        for (const feat of fc.features ?? []) {
          for (const coord of feat.geometry?.coordinates ?? []) {
            bounds.extend(coord as [number, number]);
            hasCoords = true;
          }
        }
      }
      if (hasCoords) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 700 });
      }
    }
  }, [tracks, ready]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full items-center justify-center text-[length:var(--fs-meta)] text-[color:var(--ink-3)]">
        NEXT_PUBLIC_MAPBOX_TOKEN is not set.
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function FlightLogPage() {
  const [daysBack, setDaysBack] = useState(7);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [stats, setStats] = useState<StatsData | null>(null);
  const [listData, setListData] = useState<{ rows: AircraftListRow[]; total: number } | null>(null);

  /** Boja seriji ostaje uz avion dok je odabran, i kad se drugi ukloni. */
  const [selected, setSelected] = useState<{ id: string; color: string; fixes: number }[]>([]);
  const [loadedTracks, setLoadedTracks] = useState<Record<string, LoadedTrack>>({});
  const [trackLoading, setTrackLoading] = useState<Set<string>>(new Set());
  const [limitHit, setLimitHit] = useState(false);

  // Debounced search — also resets page (async callback avoids set-state-in-effect)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 280);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  // Fetch stats once
  useEffect(() => {
    fetch(appPath("/api/flight-log/stats"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: StatsData | null) => { if (d && typeof d.total === "number") setStats(d); })
      .catch(() => {});
  }, []);

  // Fetch aircraft list
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      days: String(daysBack),
      search: debouncedSearch,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    fetch(appPath(`/api/flight-log/aircraft-list?${params}`), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { rows: AircraftListRow[]; total: number } | null) => {
        if (!cancelled) setListData(d ?? { rows: [], total: 0 });
      })
      .catch(() => { if (!cancelled) setListData({ rows: [], total: 0 }); });
    return () => { cancelled = true; };
  }, [daysBack, debouncedSearch, page]);

  // Fetch track for newly selected aircraft
  const loadTrack = useCallback(async (icao24: string, color: string, callsign: string | null) => {
    setTrackLoading((prev) => new Set(prev).add(icao24));
    try {
      const res = await fetch(appPath(`/api/flight-log/track/${icao24}?hours=${daysBack * 24}`), { cache: "no-store" });
      if (!res.ok) return;
      const geojson = await res.json();
      const count = geojson?.features?.[0]?.properties?.count ?? 0;
      setLoadedTracks((prev) => ({
        ...prev,
        [icao24]: { icao24, callsign, color, geojson, pointCount: count },
      }));
    } catch {
      // silent
    } finally {
      setTrackLoading((prev) => {
        const next = new Set(prev);
        next.delete(icao24);
        return next;
      });
    }
  }, [daysBack]);

  const toggleSelect = useCallback((row: AircraftListRow) => {
    if (selected.some((s) => s.id === row.icao24)) {
      setSelected(selected.filter((s) => s.id !== row.icao24));
      setLimitHit(false);
      return;
    }
    const color = TRACK_COLORS.find((c) => !selected.some((s) => s.color === c));
    if (!color) {
      setLimitHit(true);
      return;
    }
    setSelected([...selected, { id: row.icao24, color, fixes: row.position_count }]);
    loadTrack(row.icao24, color, row.last_callsign ?? null);
  }, [selected, loadTrack]);

  const deselect = useCallback((icao24: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== icao24));
    setLimitHit(false);
  }, []);

  const clearAll = useCallback(() => {
    setSelected([]);
    setLimitHit(false);
  }, []);

  const activeTracks: LoadedTrack[] = selected.flatMap(({ id, color }) => {
    const track = loadedTracks[id];
    return track ? [{ ...track, color }] : [];
  });

  const rows = listData?.rows ?? [];
  const totalItems = listData?.total ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const listLoading = listData === null;

  // Direct page-number entry — uncontrolled input (keyed on `page`); commits a
  // clamped value on Enter/blur.
  const commitPageInput = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    const clamped = Number.isFinite(n)
      ? Math.min(Math.max(1, n), Math.max(1, totalPages))
      : page + 1;
    setPage(clamped - 1);
    return clamped;
  }, [totalPages, page]);

  const top = stats?.topCallsigns[0];

  return (
    <div className="flex h-dvh min-h-[520px] flex-col bg-[color:var(--ground)] max-md:h-auto max-md:min-h-dvh">
      {/* Popup style injected globally */}
      <style>{`.fllog-popup .mapboxgl-popup-content{background:var(--panel);border:1px solid var(--hair);border-radius:var(--r-panel);padding:10px 14px}.fllog-popup .mapboxgl-popup-tip{display:none}`}</style>

      <PageTopBar current="log">
        <span className="flex h-[38px] items-center gap-2 rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--panel)] px-3 text-[length:var(--fs-meta)] font-semibold text-[color:var(--ink-2)]">
          <span aria-hidden className="size-2 rounded-full bg-[color:var(--live)]" />
          Local receivers logging
        </span>
      </PageTopBar>

      <main className="grid min-h-0 flex-1 grid-cols-[656px_minmax(0,1fr)] max-[1280px]:grid-cols-[560px_minmax(0,1fr)] max-md:block">
        <section aria-labelledby="log-h" className="flex min-h-0 flex-col border-r border-[color:var(--hair)] max-md:border-r-0">
          <div className="px-6 pt-5 max-md:px-4">
            <h1 id="log-h" className="text-[length:var(--fs-display)] font-extrabold leading-[1.1] tracking-[-0.015em]">
              Flight log
            </h1>
            <p className="mt-1 text-[color:var(--ink-2)]">Local ADS-B log of captured aircraft and routes.</p>
          </div>

          <dl className="mx-6 mt-4 grid grid-cols-4 rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)] max-md:mx-4 max-md:grid-cols-2">
            <SummaryCell label="Positions" value={stats ? fmtNumber(stats.total) : "—"} />
            <SummaryCell label="Last 24 h" value={stats ? fmtNumber(stats.last24h) : "—"} />
            <SummaryCell label="Aircraft" value={stats ? fmtNumber(stats.uniqueIcao) : "—"} />
            <SummaryCell
              label="Top callsign"
              value={top ? top.callsign : "—"}
              detail={top ? fmtNumber(top.count) : undefined}
            />
          </dl>

          <div className="flex items-center justify-between gap-3 px-6 pt-3.5 max-md:flex-wrap max-md:px-4">
            <div className="mt-seg" role="group" aria-label="Period">
              {RANGE_OPTS.map(({ days, label }) => (
                <button
                  key={days}
                  type="button"
                  aria-pressed={daysBack === days}
                  onClick={() => { setDaysBack(days); setPage(0); }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-field !min-h-[38px] w-[232px] text-[color:var(--ink-3)] max-md:w-full">
              <SearchIcon />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search aircraft"
                aria-label="Search aircraft"
                autoComplete="off"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent text-[length:var(--fs-body)] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-3)] max-md:text-[16px]"
              />
            </label>
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-6 pt-3 max-md:px-4">
              {selected.map(({ id, color }) => (
                <span
                  key={id}
                  className="inline-flex h-[30px] items-center gap-2 rounded-full border-[1.5px] pl-2.5 pr-1.5 text-[length:var(--fs-meta)] font-bold"
                  style={{ borderColor: color }}
                >
                  <i aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
                  {loadedTracks[id]?.callsign ?? id.toUpperCase()}
                  <button
                    type="button"
                    onClick={() => deselect(id)}
                    className="grid size-[22px] place-items-center rounded-full text-[color:var(--ink-2)] transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel-2)]"
                    aria-label={`Remove ${loadedTracks[id]?.callsign ?? id.toUpperCase()}`}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </span>
              ))}
              {selected.length > 1 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="px-1.5 py-1 text-[length:var(--fs-meta)] font-semibold text-[color:var(--ink-3)] underline underline-offset-[3px]"
                >
                  Clear all
                </button>
              )}
              {limitHit && (
                <span role="status" className="text-[length:var(--fs-meta)] text-[color:var(--ink-2)]">
                  Up to {TRACK_COLORS.length} tracks at a time.
                </span>
              )}
            </div>
          )}

          <div className="mt-3.5 flex min-h-0 flex-1 flex-col border-t border-[color:var(--hair)]">
            <div className={`${ROW_GRID} h-9 shrink-0 border-b border-[color:var(--hair-soft)] bg-[color:var(--panel)] text-[length:var(--fs-label)] font-bold text-[color:var(--ink-3)] max-md:hidden`}>
              <span />
              <span>Aircraft</span>
              <span>Flight</span>
              <span className="text-right">Fixes</span>
              <span>Last seen</span>
              <span className="max-[1280px]:hidden">Route</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto max-md:overflow-visible">
              {listLoading ? (
                <p className="px-6 py-7 text-[color:var(--ink-2)]">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="px-6 py-7 text-[color:var(--ink-2)]">
                  {debouncedSearch
                    ? `No aircraft match "${debouncedSearch}" in this period.`
                    : "No aircraft logged in this period."}
                </p>
              ) : rows.map((row) => {
                const series = selected.find((s) => s.id === row.icao24);
                const route = row.origin || row.destination ? `${row.origin ?? "?"} → ${row.destination ?? "?"}` : null;
                return (
                  <button
                    key={row.icao24}
                    type="button"
                    onClick={() => toggleSelect(row)}
                    aria-pressed={series != null}
                    className={`${ROW_GRID} min-h-[54px] w-full border-b border-[color:var(--hair-soft)] py-1.5 text-left transition-colors duration-150 max-md:min-h-[62px] max-md:grid-cols-[16px_1fr_auto] max-md:gap-y-0.5 ${
                      series ? "bg-[color:var(--panel-2)]" : "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel)]"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="size-3.5 rounded-full border-[3px] max-md:row-span-2"
                      style={{
                        borderColor: series?.color ?? "var(--ink-3)",
                        background: series?.color ?? "var(--ground)",
                      }}
                    />
                    <span className="min-w-0 max-md:order-3">
                      <b className="block text-[length:var(--fs-body)] font-extrabold max-md:inline max-md:text-[length:var(--fs-meta)] max-md:font-semibold max-md:text-[color:var(--ink-2)]">
                        {row.icao24.toUpperCase()}
                        {trackLoading.has(row.icao24) && (
                          <span className="ml-1.5 inline-block size-2.5 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" />
                        )}
                      </b>
                      <small className="block truncate text-[length:var(--fs-label)] font-medium text-[color:var(--ink-3)] max-md:hidden">
                        {row.registration || "—"}
                        {row.source ? ` · ${sourceLabel(row.source)}` : ""}
                      </small>
                    </span>
                    <span className="min-w-0 max-md:order-1">
                      <b className="block truncate font-bold max-md:font-extrabold">{row.last_callsign || "—"}</b>
                      <small className="block truncate text-[length:var(--fs-label)] font-medium text-[color:var(--ink-3)] max-md:hidden">
                        {row.description || row.aircraft_type || "—"}
                      </small>
                    </span>
                    <span className="text-right font-bold max-md:order-2">{fmtNumber(row.position_count)}</span>
                    <span className="min-w-0 max-md:order-4 max-md:text-right">
                      <b className="block text-[length:var(--fs-meta)] font-bold">{fmtDate(row.last_seen)}</b>
                      <small className="block text-[length:var(--fs-label)] font-medium text-[color:var(--ink-3)] max-md:hidden">
                        since {fmtDay(row.first_seen)}
                      </small>
                    </span>
                    <span
                      className={`truncate text-[length:var(--fs-meta)] max-[1280px]:hidden ${route ? "font-semibold text-[color:var(--ink-2)]" : "text-[color:var(--ink-3)]"}`}
                      title={route ?? undefined}
                    >
                      {route ?? "—"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-[color:var(--hair)] bg-[color:var(--panel)] px-6 pb-3 pt-2.5 max-md:px-4">
              <p className="mb-2 text-[length:var(--fs-label)] text-[color:var(--ink-3)]">
                Route comes from the Avionix dispatcher. It is a guess for reference and is not used in predictions.
              </p>
              <div className="flex items-center justify-between gap-3 text-[length:var(--fs-meta)] text-[color:var(--ink-2)]">
                <span className="inline-flex items-center gap-2">
                  {fmtNumber(totalItems)} aircraft
                  {totalPages > 1 && (
                    <>
                      <span aria-hidden>·</span>page
                      <input
                        key={page}
                        type="text"
                        inputMode="numeric"
                        aria-label="Go to page"
                        defaultValue={page + 1}
                        onChange={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9]/g, ""); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        onBlur={(e) => { e.currentTarget.value = String(commitPageInput(e.currentTarget.value)); }}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-8 w-[52px] rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--ground)] text-center font-bold text-[color:var(--ink)] outline-none focus:border-[color:var(--observer)] max-md:text-[16px]"
                      />
                      of {fmtNumber(totalPages)}
                    </>
                  )}
                </span>
                {totalPages > 1 && (
                  <span className="flex gap-2">
                    <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="mt-btn mt-btn-sm w-[42px] !px-0" aria-label="Previous page">
                      ←
                    </button>
                    <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="mt-btn mt-btn-sm w-[42px] !px-0" aria-label="Next page">
                      →
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Tracks on the map" className="relative min-h-0 min-w-0 overflow-hidden bg-[color:var(--land)] max-md:h-[360px]">
          <FlightLogMap tracks={activeTracks} />
          <div className="absolute left-4 top-4 w-[300px] rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)] px-3.5 py-3 max-md:inset-x-2 max-md:bottom-2 max-md:top-auto max-md:w-auto">
            <h2 className="mb-1.5 text-[length:var(--fs-meta)] font-bold text-[color:var(--ink-2)]">Tracks on the map</h2>
            {selected.length === 0 ? (
              <p className="text-[length:var(--fs-meta)] text-[color:var(--ink-3)]">Select a row to draw its track.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {selected.map(({ id, color, fixes }) => (
                  <li key={id} className="flex items-center gap-2.5 text-[length:var(--fs-meta)]">
                    <i aria-hidden className="h-1.5 w-[26px] rounded-[3px]" style={{ background: color }} />
                    <b className="font-extrabold">{loadedTracks[id]?.callsign ?? id.toUpperCase()}</b>
                    <span className="ml-auto text-[color:var(--ink-3)]">{fmtNumber(fixes)} fixes</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

const ROW_GRID =
  "grid grid-cols-[16px_1.1fr_1.15fr_0.65fr_1fr_0.95fr] items-center gap-3 px-6 max-[1280px]:grid-cols-[16px_1.1fr_1.1fr_0.6fr_1fr] max-md:px-4";

function SummaryCell({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 border-l border-[color:var(--hair-soft)] px-3.5 py-2.5 first:border-l-0 max-md:[&:nth-child(3)]:border-l-0 max-md:[&:nth-child(n+3)]:border-t">
      <dt className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">{label}</dt>
      <dd className="mt-0.5 truncate whitespace-nowrap text-[length:var(--fs-h2)] font-extrabold">
        {value}
        {detail ? <small className="ml-1 text-[length:var(--fs-meta)] font-semibold text-[color:var(--ink-2)]">{detail}</small> : null}
      </dd>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
