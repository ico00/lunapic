"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AircraftListRow } from "@/lib/db/flightLogDb";
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
const TRACK_COLORS = [
  "#60a5fa", "#fbbf24", "#34d399", "#a78bfa", "#fb7185",
  "#f97316", "#22d3ee", "#84cc16", "#e879f9", "#94a3b8",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtNumber(n: number): string {
  return n.toLocaleString();
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
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
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
    // tear down ALL layers bound to the source (line, glow, dot) before removing
    // the source — Mapbox throws if a source is removed while any layer uses it.
    const style = map.getStyle();
    for (const layer of style?.layers ?? []) {
      if (!layer.id.startsWith("fllog-line-") || layer.id.endsWith("-glow")) continue;
      const id = layer.id.replace("fllog-line-", "");
      if (!activeIds.has(id)) {
        for (const lid of [`fllog-line-${id}`, `fllog-line-${id}-glow`, `fllog-dot-${id}`]) {
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

        // Glow/halo under the line
        map.addLayer({
          id: `${layId}-glow`,
          type: "line",
          source: srcId,
          paint: {
            "line-color": track.color,
            "line-width": 8,
            "line-opacity": 0.15,
            "line-blur": 4,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });

        map.addLayer({
          id: layId,
          type: "line",
          source: srcId,
          paint: {
            "line-color": track.color,
            "line-width": 2,
            "line-opacity": 0.9,
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
            "circle-radius": 5,
            "circle-color": track.color,
            "circle-stroke-color": "#111",
            "circle-stroke-width": 1.5,
          },
        });

        // Hover popup
        map.on("mouseenter", layId, (e) => {
          map.getCanvas().style.cursor = "pointer";
          popupRef.current?.remove();
          const feat = e.features?.[0];
          const props = feat?.properties as { icao24?: string; count?: number; callsign?: string } | undefined;
          const html = `
            <div style="font-family:monospace;font-size:12px;line-height:1.5;color:#f4f5fb">
              <div style="font-weight:700;color:${track.color}">${track.callsign ?? track.icao24.toUpperCase()}</div>
              <div style="color:#8b90a8">${track.icao24.toUpperCase()}</div>
              <div style="margin-top:4px">${fmtNumber(props?.count ?? track.pointCount)} pozicija</div>
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
      <div
        className="flex h-full items-center justify-center rounded-[18px] text-sm"
        style={{ background: "var(--glass-2)", color: "var(--t-tertiary)" }}
      >
        NEXT_PUBLIC_MAPBOX_TOKEN nije postavljen.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full rounded-[18px] overflow-hidden" />
      {tracks.length === 0 && ready && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[18px]"
          style={{ background: "rgba(5,7,20,0.55)" }}
        >
          <svg className="size-10 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
            <path d="M3 3l18 18M10.5 10.677A4 4 0 0 0 8 14c0 2.21 1.79 4 4 4a4 4 0 0 0 3.323-1.5M6.343 6.343A8 8 0 0 0 4 12c0 4.418 3.582 8 8 8a8 8 0 0 0 5.657-2.343M9 3.532A8 8 0 0 1 20 12a7.96 7.96 0 0 1-.468 2.694" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm" style={{ color: "var(--t-tertiary)" }}>
            Odaberi avion iz liste za prikaz rute
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-[14px] border px-4 py-3"
      style={{ background: "var(--glass-3)", borderColor: "var(--glass-stroke)" }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--t-tertiary)" }}>
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--t-primary)" }}>
        {typeof value === "number" ? fmtNumber(value) : value}
      </div>
    </div>
  );
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

  const [selected, setSelected] = useState<string[]>([]);
  const [loadedTracks, setLoadedTracks] = useState<Record<string, LoadedTrack>>({});
  const [trackLoading, setTrackLoading] = useState<Set<string>>(new Set());

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
    setSelected((prev) => {
      if (prev.includes(row.icao24)) {
        return prev.filter((id) => id !== row.icao24);
      }
      if (prev.length >= 10) return prev;
      const color = TRACK_COLORS[prev.length % TRACK_COLORS.length];
      // Kick off track load if not already cached
      loadTrack(row.icao24, color, row.last_callsign ?? null);
      return [...prev, row.icao24];
    });
  }, [loadTrack]);

  const deselect = useCallback((icao24: string) => {
    setSelected((prev) => prev.filter((id) => id !== icao24));
  }, []);

  const clearAll = useCallback(() => setSelected([]), []);

  const activeTracks: LoadedTrack[] = selected
    .map((id) => loadedTracks[id] ?? null)
    .filter((t): t is LoadedTrack => t !== null)
    .map((t, i) => ({ ...t, color: TRACK_COLORS[i % TRACK_COLORS.length] }));

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

  return (
    <div
      className="min-h-dvh w-full overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8"
      style={{ backgroundColor: "var(--bg-0)" }}
    >
      {/* Popup style injected globally */}
      <style>{`.mapboxgl-popup-content{background:rgba(10,14,31,0.96)!important;border:1px solid rgba(255,255,255,0.12)!important;border-radius:10px!important;padding:10px 14px!important;box-shadow:0 8px 24px rgba(0,0,0,0.6)!important}.mapboxgl-popup-tip{display:none!important}`}</style>

      <div className="mx-auto max-w-screen-2xl">

        {/* ── Header ─────────────────────────────────────────────── */}
        <header
          className="relative overflow-hidden rounded-[22px] border p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-[28px]"
          style={{ background: "var(--glass-2)", borderColor: "var(--glass-stroke-strong)" }}
        >
          <div
            className="pointer-events-none absolute left-6 right-6 top-0 h-[1.5px] rounded-full"
            style={{ background: "linear-gradient(90deg,var(--sky) 0%,rgba(96,165,250,0.3) 50%,transparent 100%)" }}
            aria-hidden
          />
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/logo.png")} alt="LunaPic logo" width={36} height={36} decoding="async" className="h-9 w-auto object-contain" />
            <span className="mt-title text-xl leading-none">LunaPic</span>
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="mt-title text-3xl font-semibold tracking-tight sm:text-4xl">
                Flight Log
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--t-secondary)" }}>
                Lokalni ADS-B log — pregled snimljenih aviona i ruta
              </p>
            </div>
            <Link
              href="/"
              className="mt-toolbar-btn inline-flex items-center gap-1.5 px-3 text-sm"
              style={{ color: "var(--t-secondary)" }}
            >
              <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Planner
            </Link>
          </div>
        </header>

        {/* ── Stats strip ──────────────────────────────────────────── */}
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Ukupno pozicija" value={stats.total} />
            <StatCard label="Zadnjih 24h" value={stats.last24h} />
            <StatCard label="Jedinstveni ICAO" value={stats.uniqueIcao} />
            <StatCard
              label="Top callsign"
              value={stats.topCallsigns[0] ? `${stats.topCallsigns[0].callsign} (${fmtNumber(stats.topCallsigns[0].count)})` : "—"}
            />
          </div>
        )}

        {/* ── Controls ─────────────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Time range pills */}
          {([1, 7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { setDaysBack(d); setPage(0); }}
              className="rounded-[10px] border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={daysBack === d
                ? { background: "var(--sky-soft)", borderColor: "var(--sky-line)", color: "var(--sky)" }
                : { background: "var(--glass-3)", borderColor: "var(--glass-stroke)", color: "var(--t-tertiary)" }}
            >
              {d === 1 ? "24h" : d === 7 ? "7 dana" : d === 30 ? "30 dana" : "90 dana"}
            </button>
          ))}

          {/* Search */}
          <div className="ml-auto">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ICAO, callsign, reg…"
              autoComplete="off"
              spellCheck={false}
              className="rounded-[10px] border px-3 py-1.5 text-sm outline-none transition w-48"
              style={{
                background: "var(--glass-3)",
                borderColor: "var(--glass-stroke-strong)",
                color: "var(--t-primary)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--sky-line)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--glass-stroke-strong)"; }}
            />
          </div>
        </div>

        {/* ── Selected chips ───────────────────────────────────────── */}
        {selected.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {selected.map((id, idx) => {
              const color = TRACK_COLORS[idx % TRACK_COLORS.length];
              const track = loadedTracks[id];
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
                  style={{ background: `${color}18`, borderColor: `${color}50`, color }}
                >
                  <span
                    className="inline-block size-2 rounded-full shrink-0"
                    style={{ background: color }}
                    aria-hidden
                  />
                  {track?.callsign ?? id.toUpperCase()}
                  <button
                    type="button"
                    onClick={() => deselect(id)}
                    className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                    aria-label={`Ukloni ${id}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {selected.length > 1 && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                style={{ borderColor: "var(--glass-stroke)", color: "var(--t-tertiary)" }}
              >
                Očisti sve
              </button>
            )}
          </div>
        )}

        {/* ── Main split layout ────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">

          {/* Left: aircraft table */}
          <div>
            <div
              className="rounded-[18px] border overflow-hidden"
              style={{ background: "var(--glass-1)", borderColor: "var(--glass-stroke)" }}
            >
              <div
                className="pointer-events-none h-[1.5px] w-full"
                style={{ background: "linear-gradient(90deg,var(--sky) 0%,rgba(96,165,250,0.2) 60%,transparent 100%)" }}
                aria-hidden
              />

              {/* Table header */}
              <div
                className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1.5fr] gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.15em]"
                style={{ color: "var(--t-tertiary)", borderBottom: "1px solid var(--glass-stroke)" }}
              >
                <span>ICAO / Reg</span>
                <span>Callsign / Type</span>
                <span className="text-right">Pozicije</span>
                <span className="hidden sm:block text-right">Prva</span>
                <span className="text-right">Zadnja</span>
              </div>

              {/* Rows */}
              <div className="divide-y" style={{ borderColor: "var(--glass-stroke)" }}>
                {listLoading ? (
                  <div className="py-10 text-center text-sm" style={{ color: "var(--t-tertiary)" }}>
                    Učitavam…
                  </div>
                ) : rows.length === 0 ? (
                  <div className="py-10 text-center text-sm" style={{ color: "var(--t-tertiary)" }}>
                    Nema zapisa za odabrani period.
                  </div>
                ) : rows.map((row) => {
                  const isSelected = selected.includes(row.icao24);
                  const colorIdx = selected.indexOf(row.icao24);
                  const color = isSelected ? TRACK_COLORS[colorIdx % TRACK_COLORS.length] : undefined;
                  const isLoading = trackLoading.has(row.icao24);

                  return (
                    <button
                      key={row.icao24}
                      type="button"
                      onClick={() => toggleSelect(row)}
                      className="grid w-full grid-cols-[2fr_2fr_1.5fr_1fr_1.5fr] gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.04]"
                      style={isSelected
                        ? { background: `${color}12`, borderLeft: `2px solid ${color}` }
                        : { borderLeft: "2px solid transparent" }}
                      title={isSelected ? "Klikni za uklanjanje iz mape" : "Klikni za prikaz na mapi"}
                    >
                      {/* ICAO / Reg */}
                      <div>
                        <div
                          className="font-mono text-xs font-semibold"
                          style={{ color: isSelected ? color : "var(--t-primary)" }}
                        >
                          {row.icao24.toUpperCase()}
                          {isLoading && (
                            <span className="ml-1.5 inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" />
                          )}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--t-tertiary)" }}>
                          {row.registration || "—"}
                        </div>
                      </div>

                      {/* Callsign / Type */}
                      <div>
                        <div className="text-xs font-semibold" style={{ color: "var(--t-primary)" }}>
                          {row.last_callsign || "—"}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--t-tertiary)" }}>
                          {row.description || row.aircraft_type || "—"}
                        </div>
                      </div>

                      {/* Position count */}
                      <div className="text-right tabular-nums text-xs" style={{ color: "var(--t-secondary)" }}>
                        {fmtNumber(row.position_count)}
                      </div>

                      {/* First seen */}
                      <div className="hidden sm:block text-right text-[11px]" style={{ color: "var(--t-tertiary)" }}>
                        {fmtDate(row.first_seen)}
                      </div>

                      {/* Last seen */}
                      <div className="text-right text-[11px]" style={{ color: "var(--t-tertiary)" }}>
                        {fmtDate(row.last_seen)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderTop: "1px solid var(--glass-stroke)" }}
                >
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--t-tertiary)" }}>
                    {fmtNumber(totalItems)} aviona · stranica
                    <input
                      key={page}
                      type="text"
                      inputMode="numeric"
                      aria-label="Idi na stranicu"
                      defaultValue={page + 1}
                      onChange={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9]/g, ""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      onBlur={(e) => { e.currentTarget.value = String(commitPageInput(e.currentTarget.value)); }}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-11 rounded-[6px] border px-1.5 py-0.5 text-center outline-none"
                      style={{ background: "var(--glass-3)", borderColor: "var(--glass-stroke-strong)", color: "var(--t-primary)" }}
                    />
                    /{totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-[8px] border px-3 py-1 text-xs transition-colors disabled:opacity-30"
                      style={{ background: "var(--glass-3)", borderColor: "var(--glass-stroke)", color: "var(--t-secondary)" }}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-[8px] border px-3 py-1 text-xs transition-colors disabled:opacity-30"
                      style={{ background: "var(--glass-3)", borderColor: "var(--glass-stroke)", color: "var(--t-secondary)" }}
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* List count when no pagination needed */}
            {totalPages <= 1 && totalItems > 0 && (
              <p className="mt-2 px-1 text-xs" style={{ color: "var(--t-tertiary)" }}>
                {fmtNumber(totalItems)} avion{totalItems === 1 ? "" : "a"} u periodu
              </p>
            )}
          </div>

          {/* Right: sticky map */}
          <div className="lg:sticky lg:top-4" style={{ height: "calc(100dvh - 2rem)" }}>
            <FlightLogMap tracks={activeTracks} />
          </div>
        </div>

      </div>
    </div>
  );
}
