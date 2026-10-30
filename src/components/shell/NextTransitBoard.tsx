"use client";

import { createContext, useContext, useMemo } from "react";
import { useWallNowMs } from "@/hooks/useWallNowMs";
import {
  CAUTION_BELOW_DEG,
  CRITICAL_BELOW_DEG,
} from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import { buildLiveShadowTrack } from "@/lib/domain/geometry/liveShadowTrack";
import { evaluateShotFeasibility } from "@/lib/domain/geometry/shotFeasibility";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { isFlightFixStale } from "@/lib/flight/flightFixFreshness";
import { formatFixed } from "@/lib/format/numbers";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import type { GroundObserver } from "@/types/geo";
import type { MoonState } from "@/types/moon";
import type { TransitCandidate } from "@/types/transit";

/**
 * Ploča "Next transit" (spec §2b.8): odgovara kad, koji avion i stojim li
 * na liniji, prije nego što se otvori ijedan panel. Tranzit se crta kao
 * linija sa stanicama (sada, ulazak u disk, poravnanje, izlazak).
 */

const ROW_LIMIT = 6;
const SHADOW_BUCKET_MS = 5_000;
/** Isti horizont kao `MAX_ALIGNMENT_LOOKAHEAD_SEC`: dalje predviđanje ne vrijedi. */
const PREDICTION_LIMIT_MS = 300_000;

type BoardVariant = "rail" | "sheet";
const VariantContext = createContext<BoardVariant>("rail");

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function countdown(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function etaSec(c: TransitCandidate, nowMs: number): number | null {
  const at = c.prediction?.alignmentAtMs;
  return at == null ? null : (at - nowMs) / 1000;
}

function flightLabel(c: TransitCandidate): string {
  return c.flight.callSign?.trim() || c.flight.registration || c.flight.id;
}

function flightLevel(c: TransitCandidate): string | null {
  const m = c.flight.baroAltitudeMeters ?? c.flight.geoAltitudeMeters;
  return m == null ? null : `FL${String(Math.round(m / 0.3048 / 100)).padStart(3, "0")}`;
}

type Props = {
  candidates: readonly TransitCandidate[];
  selectedFlightId: string | null;
  onSelectFlight: (id: string) => void;
  observer: GroundObserver;
  moon: MoonState;
  showEphemeris: boolean;
  isPlanned: boolean;
  watchedFlightCount: number;
  onOpenCandidates: () => void;
  /** `rail` = uz izbornik na desktopu, `sheet` = donji panel na telefonu. */
  variant?: BoardVariant;
};

export function NextTransitBoard({
  candidates,
  selectedFlightId,
  onSelectFlight,
  observer,
  moon,
  showEphemeris,
  isPlanned,
  watchedFlightCount,
  onOpenCandidates,
  variant = "rail",
}: Props) {
  const compact = variant === "sheet";
  const nowMs = useWallNowMs(1000);
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const focalMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const sensorType = useMoonTransitStore((s) => s.cameraSensorType);

  const ordered = useMemo(
    () =>
      [...candidates].sort(
        (a, b) =>
          (a.prediction?.alignmentAtMs ?? Infinity) -
          (b.prediction?.alignmentAtMs ?? Infinity)
      ),
    [candidates]
  );

  const subject = useMemo(() => {
    if (selectedFlightId) {
      const picked = ordered.find((c) => c.flight.id === selectedFlightId);
      if (picked) return picked;
    }
    return ordered.find((c) => c.willTransit) ?? ordered[0] ?? null;
  }, [ordered, selectedFlightId]);

  const moonLow = moon.altitudeDeg < CRITICAL_BELOW_DEG;

  const detail = useMemo(() => {
    if (!subject || !showEphemeris || isPlanned || moonLow) return null;
    const raw = subject.flight;
    if (isFlightFixStale(raw, nowMs, latencySkewMs)) return null;
    const flight = extrapolateFlightForDisplay(raw, nowMs, latencySkewMs);
    const pack = GeometryEngine.photographerPack(
      observer,
      flight,
      moon,
      new Date(nowMs),
      { airlinerLengthMeters: flight.lengthMeters ?? undefined }
    );
    if (!pack || pack.timeToAlignmentSec == null) return null;
    const shot = evaluateShotFeasibility(observer, flight, {
      focalLengthMm: focalMm,
      sensorType,
    });
    return { flight, pack, shot };
  }, [subject, showEphemeris, isPlanned, moonLow, nowMs, latencySkewMs, observer, moon, focalMm, sensorType]);

  // Linija stajanja: ~21 Newtonovih rješenja, pa se računa u kanti od 5 s
  // (isti razlog kao `useSelectedFlightShadowTrack`, vidi AGENTS.md o CPU-u).
  const shadowBucket = Math.floor(nowMs / SHADOW_BUCKET_MS);
  const detailFlightId = detail?.flight.id ?? null;
  const alignmentKnown = detail?.pack.timeToAlignmentSec != null;
  const standing = useMemo(() => {
    if (!detail) return null;
    const track = buildLiveShadowTrack({
      flight: detail.flight,
      nowMs: shadowBucket * SHADOW_BUCKET_MS,
      groundHeightMeters: observer.groundHeightMeters ?? 0,
    });
    if (!track) return null;
    const target = detail.pack.timeToAlignmentSec ?? 0;
    const sample = track.samples.reduce((best, s) =>
      Math.abs(s.offsetSec - target) < Math.abs(best.offsetSec - target) ? s : best
    );
    const { spot } = sample;
    const metersPerDegLat = 111_320;
    const dN = (observer.lat - spot.lat) * metersPerDegLat;
    const dE = (observer.lng - spot.lng) * metersPerDegLat * Math.cos((observer.lat * Math.PI) / 180);
    const az = (spot.moonAzimuthDeg * Math.PI) / 180;
    // Pozitivno = promatrač je desno od linije kad gleda prema Mjesecu.
    const offsetRight = dE * Math.cos(az) - dN * Math.sin(az);
    return { offsetRight, tolerance: spot.crossTrackToleranceMeters };
    // `detail` se mijenja svake sekunde; linija stajanja se računa samo po kanti od 5 s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailFlightId, alignmentKnown, shadowBucket, observer.lat, observer.lng, observer.groundHeightMeters]);

  /* ------------------------------ prazna stanja ---------------------------- */

  if (!showEphemeris) {
    return <Shell variant={variant}><p className="px-4 py-6 text-[length:var(--fs-body)] text-[color:var(--ink-2)]">Loading the sky…</p></Shell>;
  }
  if (isPlanned) {
    return (
      <Shell variant={variant}>
        <Empty
          title="Planning mode"
          body="Live candidates are paused while you look at another time. Sync to now to see what is coming."
        />
      </Shell>
    );
  }
  // Mjesec ispod horizonta: ploča se ne crta (prazna kartica je samo zauzimala
  // kartu); traka vremena pokazuje kad Mjesec prelazi 5°.
  if (moonLow) return null;
  if (!subject || !detail) {
    return (
      <Shell variant={variant}>
        <div className="flex items-center gap-2.5 px-4 pt-3.5">
          <span className="inline-flex h-[26px] items-center rounded-full border border-[color:var(--hair)] bg-[color:var(--panel-2)] px-2.5 text-[length:var(--fs-label)] font-extrabold text-[color:var(--ink-2)]">
            Watching
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[length:var(--fs-meta)] text-[color:var(--ink-3)]">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: watchedFlightCount > 0 ? "var(--live)" : "var(--ink-3)" }}
            />
            {watchedFlightCount} aircraft in range
          </span>
        </div>
        <h1 className="px-4 pt-2.5 text-[length:var(--fs-display)] font-extrabold leading-[1.1] tracking-[-0.015em] text-balance">
          No transit in the next 5 minutes
        </h1>
        <p className="px-4 pt-1.5 text-[length:var(--fs-body)] text-[color:var(--ink-2)]">
          {watchedFlightCount > 0
            ? "Nothing reaches the camera frame yet."
            : "No aircraft are in range of the selected source."}
        </p>
        <TransitLine idle nowLabel={clock(nowMs)} alignLabel={clock(nowMs + PREDICTION_LIMIT_MS)} />
        <CautionNote altitudeDeg={moon.altitudeDeg} />
        <dl className="grid grid-cols-3 border-t border-[color:var(--hair-soft)]">
          <Fact label="Moon altitude" value={formatFixed(moon.altitudeDeg, 0)} unit="°" />
          <Fact label="Moon azimuth" value={formatFixed(moon.azimuthDeg, 0)} unit="°" />
          <Fact label="Moon lit" value={formatFixed(moon.illuminationFraction * 100, 0)} unit="%" />
        </dl>
      </Shell>
    );
  }

  /* ------------------------------ glavni prikaz ---------------------------- */

  const { pack, shot, flight } = detail;
  const toGo = pack.timeToAlignmentSec ?? 0;
  const alignAt = nowMs + toGo * 1000;
  const isDisc = subject.willTransit;
  const dur = pack.transitDurationMs ?? 0;
  const speedKmh = flight.groundSpeedMps != null ? Math.round(flight.groundSpeedMps * 3.6) : null;
  const level = flightLevel(subject);
  const gap = pack.elevationGapAtAlignmentDeg;
  const others = ordered.filter((c) => c.flight.id !== subject.flight.id).slice(0, ROW_LIMIT);
  const tier = shot?.tier;

  return (
    <Shell variant={variant}>
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <span
          className={`inline-flex h-[26px] items-center rounded-full px-2.5 text-[length:var(--fs-label)] font-extrabold uppercase tracking-[0.02em] ${
            isDisc ? "bg-[color:var(--disc)] text-[#1a0703]" : "bg-[color:var(--observer)] text-[#06143a]"
          }`}
        >
          {isDisc ? "Disc transit" : "In frame"}
        </span>
        {subject.prediction ? (
          <span className="ml-auto flex items-center gap-1.5 text-[length:var(--fs-meta)] text-[color:var(--ink-3)]">
            <span aria-hidden className="size-2 rounded-full bg-[color:var(--live)]" />
            Fix {Math.max(0, Math.round((nowMs - subject.prediction.fixTimestampMs) / 1000))} s old
          </span>
        ) : null}
      </div>

      <h1 className="px-4 pt-2.5 text-[length:var(--fs-display)] font-extrabold leading-[1.1] tracking-[-0.015em] text-balance">
        {isDisc ? "Moon crossing in " : "Frame pass in "}
        <span className={isDisc ? "text-[color:var(--disc-text)]" : "text-[color:var(--observer-text)]"}>
          {countdown(toGo)}
        </span>
      </h1>
      <p className="px-4 pt-1.5 text-[length:var(--fs-body)] text-[color:var(--ink-2)]">
        <b className="font-bold text-[color:var(--ink)]">{flightLabel(subject)}</b>
        {subject.flight.aircraftType ? ` · ${subject.flight.aircraftType}` : ""}
        {level ? ` · ${level}` : ""}
        {speedKmh != null ? ` · ${speedKmh} km/h` : ""}
      </p>

      <TransitLine
        isDisc={isDisc}
        idle={false}
        nowLabel={clock(nowMs)}
        alignLabel={clock(alignAt)}
        enterLabel={isDisc && dur > 0 ? clock(alignAt - dur / 2) : null}
        leaveLabel={isDisc && dur > 0 ? clock(alignAt + dur / 2) : null}
        gapNote={!isDisc && gap != null ? `${formatFixed(Math.abs(gap), 2)}° ${gap < 0 ? "below" : "above"} the disc` : null}
      />

      <CautionNote altitudeDeg={moon.altitudeDeg} />

      {standing ? (
        <div className="border-t border-[color:var(--hair-soft)] px-4 py-2.5">
          <div className="mb-2 flex items-baseline justify-between gap-3 whitespace-nowrap text-[length:var(--fs-meta)] font-bold text-[color:var(--ink-2)]">
            <span>Are you on the line?</span>
            <span
              className={`text-[length:var(--fs-body)] font-extrabold ${
                Math.abs(standing.offsetRight) <= standing.tolerance
                  ? "text-[color:var(--live)]"
                  : "text-[color:var(--disc-text)]"
              }`}
            >
              {Math.abs(standing.offsetRight) <= standing.tolerance ? "Yes" : "No"},{" "}
              {formatFixed(Math.abs(standing.offsetRight), 0)} m {standing.offsetRight >= 0 ? "right" : "left"}
            </span>
          </div>
          <LinePosition offset={standing.offsetRight} tolerance={standing.tolerance} />
          <p className="mt-1 text-[length:var(--fs-meta)] text-[color:var(--ink-3)] max-md:hidden">
            Facing the Moon. The disc stays covered within{" "}
            <b className="font-semibold text-[color:var(--ink-2)]">±{formatFixed(standing.tolerance, 0)} m</b>
            {Math.abs(standing.offsetRight) > standing.tolerance
              ? `. Step ${formatFixed(Math.abs(standing.offsetRight), 0)} m ${standing.offsetRight >= 0 ? "left" : "right"}.`
              : "."}
          </p>
        </div>
      ) : null}

      <dl className={`grid-cols-3 border-t border-[color:var(--hair-soft)] ${compact ? "hidden" : "grid"}`}>
        <Fact label="Range" value={formatFixed(pack.futureSlantMeters != null ? pack.futureSlantMeters / 1000 : (shot?.slantRangeMeters ?? 0) / 1000, 0)} unit="km" />
        <Fact label="Disc coverage" value={shot ? formatFixed(shot.moonCoveragePercent, 1) : "—"} unit="%" />
        <Fact
          label="Shot rating"
          value={tier ? tier[0].toUpperCase() + tier.slice(1) : "—"}
          tone={tier === "excellent" ? "good" : tier === "poor" ? "bad" : undefined}
        />
      </dl>

      <div className="border-t border-[color:var(--hair-soft)] px-4 py-2.5">
        <button
          type="button"
          onClick={() => onSelectFlight(subject.flight.id)}
          className="mt-btn mt-btn-primary w-full whitespace-nowrap"
        >
          Show on map
        </button>
      </div>

      {compact && ordered.length > 1 ? (
        <button
          type="button"
          onClick={onOpenCandidates}
          className="min-h-[42px] border-t border-[color:var(--hair-soft)] px-4 text-left text-[length:var(--fs-meta)] font-semibold text-[color:var(--ink-2)]"
        >
          All {ordered.length} candidates
        </button>
      ) : null}

      {!compact && others.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-[color:var(--hair-soft)]">
          <div className="flex items-center justify-between px-4 pb-1 pt-2.5 text-[length:var(--fs-meta)] font-bold text-[color:var(--ink-2)]">
            <span>Other candidates</span>
            <button
              type="button"
              onClick={onOpenCandidates}
              className="font-medium text-[color:var(--ink-3)] underline underline-offset-4 [@media(hover:hover)_and_(pointer:fine)]:hover:text-[color:var(--ink)]"
            >
              All {ordered.length}
            </button>
          </div>
          <ul>
            {others.map((c) => {
              const eta = etaSec(c, nowMs);
              return (
                <li key={c.flight.id}>
                  <button
                    type="button"
                    onClick={() => onSelectFlight(c.flight.id)}
                    className="grid min-h-[42px] w-full grid-cols-[10px_1fr_auto] items-center gap-3 px-4 py-1 text-left transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel-2)]"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full border-[2.5px]"
                      style={{ borderColor: c.willTransit ? "var(--disc)" : "var(--observer)" }}
                    />
                    <span className="min-w-0 text-[length:var(--fs-body)] font-extrabold">
                      {flightLabel(c)}
                      <small className="block truncate text-[length:var(--fs-label)] font-medium text-[color:var(--ink-3)]">
                        {c.flight.aircraftType ?? "Unknown type"} · {c.willTransit ? "Disc transit" : "In frame"}
                      </small>
                    </span>
                    <span className="text-right text-[length:var(--fs-body)] font-extrabold">
                      {eta != null ? countdown(eta) : "—"}
                      <small className="block text-[length:var(--fs-label)] font-medium text-[color:var(--ink-3)]">
                        {c.prediction ? clock(c.prediction.alignmentAtMs) : ""}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Shell>
  );
}

/* ------------------------------ dijelovi ----------------------------------- */

function Shell({ children, variant }: { children: React.ReactNode; variant: BoardVariant }) {
  const frame =
    "pointer-events-auto flex flex-col overflow-hidden rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)]";
  if (variant === "sheet") {
    return (
      <VariantContext.Provider value="sheet">
        <section aria-label="Next transit" className={`${frame} relative min-h-0 overflow-y-auto`}>
          {children}
        </section>
      </VariantContext.Provider>
    );
  }
  return (
    <section
      aria-label="Next transit"
      className={`${frame} absolute left-[216px] z-[15] w-[408px]`}
      style={{
        top: "calc(3.5rem + env(safe-area-inset-top) + 1rem)",
        // Ispod ploče stoje Layers i legenda visina (lijevi rub, iznad trake
        // vremena), pa ploča ostavlja mjesta za njih umjesto da ih prekrije.
        maxHeight: "calc(100% - 3.5rem - env(safe-area-inset-top) - 1rem - 13rem)",
      }}
    >
      {children}
    </section>
  );
}

/** Mjesec 5–12°: kandidati se računaju, ali magla uz horizont može sakriti disk. */
function CautionNote({ altitudeDeg }: { altitudeDeg: number }) {
  if (altitudeDeg >= CAUTION_BELOW_DEG) return null;
  return (
    <p className="mt-note mx-4 my-2">
      <b className="font-extrabold">Moon is low, {formatFixed(altitudeDeg, 0)}°.</b> Haze near the horizon can hide the disc.
    </p>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-5">
      <h1 className="text-[length:var(--fs-h1)] font-extrabold leading-tight tracking-[-0.01em]">{title}</h1>
      <p className="mt-1.5 text-[length:var(--fs-body)] text-[color:var(--ink-2)]">{body}</p>
    </div>
  );
}

function Fact({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "good" | "bad" }) {
  return (
    <div className="border-l border-[color:var(--hair-soft)] px-4 py-2 first:border-l-0">
      <dt className="text-[length:var(--fs-label)] font-semibold text-[color:var(--ink-3)]">{label}</dt>
      <dd
        className={`text-[length:var(--fs-h2)] font-extrabold ${
          tone === "good" ? "text-[color:var(--live)]" : tone === "bad" ? "text-[color:var(--disc-text)]" : ""
        }`}
      >
        {value}
        {unit ? <small className="ml-0.5 text-[length:var(--fs-meta)] font-semibold text-[color:var(--ink-2)]">{unit}</small> : null}
      </dd>
    </div>
  );
}

/**
 * Tranzit kao linija: sada, (ulaz), poravnanje (presjecište), (izlaz). `idle`
 * crta istu liniju bez poravnanja: prigušena, do granice predviđanja.
 */
function TransitLine({
  isDisc = false,
  idle,
  nowLabel,
  alignLabel,
  enterLabel = null,
  leaveLabel = null,
  gapNote = null,
}: {
  isDisc?: boolean;
  idle: boolean;
  nowLabel: string;
  alignLabel: string;
  enterLabel?: string | null;
  leaveLabel?: string | null;
  gapNote?: string | null;
}) {
  const compact = useContext(VariantContext) === "sheet";
  const ink = idle ? "#33466f" : isDisc ? "var(--disc)" : "var(--observer)";
  return (
    <div className="px-2 pb-1 pt-2.5">
      <svg
        viewBox={compact ? "0 18 392 104" : "0 -18 392 140"}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={idle ? "Prediction line from now to five minutes ahead, no alignment" : "Transit line from now to alignment"}
      >
        <path
          d={idle ? "M24 78 H108 L146 40 H368" : "M24 78 H108 L146 40 H232 H368"}
          fill="none"
          stroke={ink}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={idle ? "2 14" : undefined}
        />
        <circle cx="24" cy="78" r="9" fill="var(--ground)" stroke="var(--ink)" strokeWidth="3.5" />
        <text x="24" y="104" className="fill-[color:var(--ink)] text-[13px] font-bold">{nowLabel}</text>
        <text x="24" y="118" className="fill-[color:var(--ink-2)] text-[12px] font-semibold">Now</text>
        {idle ? (
          <>
            <circle cx="368" cy="40" r="7" fill="var(--ground)" stroke="var(--ink-3)" strokeWidth="3" />
            <text x="368" y="88" textAnchor="end" className="fill-[color:var(--ink)] text-[13px] font-bold">{alignLabel}</text>
            <text x="368" y="104" textAnchor="end" className="fill-[color:var(--ink-2)] text-[12px] font-semibold">Prediction limit</text>
          </>
        ) : (
          <>
            <circle cx="232" cy="40" r="17" fill="var(--ground)" stroke="var(--ink)" strokeWidth="4" />
            <circle cx="232" cy="40" r="7" fill={ink} />
            <text x="232" y="88" textAnchor="middle" className="fill-[color:var(--ink)] text-[14px] font-extrabold">{alignLabel}</text>
            <text x="232" y="104" textAnchor="middle" className="fill-[color:var(--ink-2)] text-[12px] font-semibold">{isDisc ? "Alignment" : "Closest pass"}</text>
          </>
        )}
        {enterLabel ? (
          <>
            <circle cx="146" cy="40" r="7" fill="var(--ground)" stroke="var(--ink)" strokeWidth="3" />
            {compact ? null : (
              <>
                <text x="146" y="14" textAnchor="middle" className="fill-[color:var(--ink)] text-[13px] font-bold">{enterLabel}</text>
                <text x="146" y="-2" textAnchor="middle" className="fill-[color:var(--ink-2)] text-[12px] font-semibold">Enters disc</text>
              </>
            )}
          </>
        ) : null}
        {leaveLabel ? (
          <>
            <circle cx="330" cy="40" r="7" fill="var(--ground)" stroke="var(--ink)" strokeWidth="3" />
            {compact ? null : (
              <>
                <text x="330" y="14" textAnchor="middle" className="fill-[color:var(--ink)] text-[13px] font-bold">{leaveLabel}</text>
                <text x="330" y="-2" textAnchor="middle" className="fill-[color:var(--ink-2)] text-[12px] font-semibold">Leaves disc</text>
              </>
            )}
          </>
        ) : null}
        {gapNote ? (
          <text x="330" y={compact ? 30 : 20} textAnchor="middle" className="fill-[color:var(--ink-2)] text-[12px] font-semibold">{gapNote}</text>
        ) : null}
      </svg>
    </div>
  );
}

/** Poprečni položaj: zelena zona = tolerancija, krug = promatrač. */
function LinePosition({ offset, tolerance }: { offset: number; tolerance: number }) {
  const half = 126;
  const ratio = Math.max(-1.4, Math.min(1.4, offset / Math.max(tolerance, 1)));
  const cx = 188 + ratio * half;
  const inside = Math.abs(offset) <= tolerance;
  return (
    <svg viewBox="0 0 376 48" className="h-auto w-full overflow-visible" role="img" aria-label={`Cross-track position ${formatFixed(Math.abs(offset), 0)} metres ${offset >= 0 ? "right" : "left"} of the centre line, tolerance plus or minus ${formatFixed(tolerance, 0)} metres`}>
      <rect x={188 - half} y="12" width={half * 2} height="10" rx="5" fill="color-mix(in srgb, var(--live) 28%, var(--panel))" stroke="var(--live)" strokeWidth="1.5" />
      <line x1="188" y1="4" x2="188" y2="30" stroke="var(--ink-2)" strokeWidth="2" />
      <circle cx={cx} cy="17" r="9" fill="var(--ground)" stroke={inside ? "var(--observer)" : "var(--disc)"} strokeWidth="4" />
      <text x={188 - half} y="46" className="fill-[color:var(--ink-3)] text-[12px] font-semibold">L {formatFixed(tolerance, 0)} m</text>
      <text x={188 + half} y="46" textAnchor="end" className="fill-[color:var(--ink-3)] text-[12px] font-semibold">R {formatFixed(tolerance, 0)} m</text>
    </svg>
  );
}
