import { greatCircleDistanceMeters } from "@/lib/domain/geo/greatCircleDistance";
import {
  destinationByAzimuthMeters,
  initialBearingDeg,
} from "@/lib/domain/geometry/wgs84";
import { EXTRAPOLATION_FALLBACK_SPEED_MPS } from "@/lib/flight/extrapolateFlightPosition";

export type DisplayFix = {
  readonly lat: number;
  readonly lng: number;
  /** Wall-clock ms kad je ova prikazana pozicija izračunata. */
  readonly atMs: number;
};

/**
 * Iznad ove pogreške ne "sustižemo" nego skačemo odmah. Toliko velika razlika
 * nije šum nego diskontinuitet (avion se tek pojavio, izvor se promijenio,
 * ili je podatak neispravan) — puzanje kroz desetke kilometara izgledalo bi
 * gore od skoka.
 */
const SNAP_ERROR_METERS = 30_000;

/**
 * Najveći udio pomaka koji smije otići na korekciju. Ključno < 1: korekcija
 * nikad ne može pojesti cijeli pomak unaprijed, pa se marker NIKAD ne kreće
 * unatrag — samo privremeno sporije (0.5×) ili brže (1.5×) od stvarne brzine.
 */
const MAX_CORRECTION_FRACTION = 0.5;

/**
 * Vremenska konstanta sustizanja VELIKE pogreške (meta daleko ispred ili sa
 * strane). Uz samo `MAX_CORRECTION_FRACTION` marker sustiže brzinom 0.5·v, pa
 * je razlika od 11 km (Pi redak bez traka/brzine 40 s, pa redak s njima —
 * snimljeno 2026-11-24) trajala ~80 s; toliko dugo je klik na avion skakao.
 * Ispod ~0.5·v·TAU (≈ 300 m) vrijedi stari budžet, pa se mali šum ne vidi.
 */
const LARGE_ERROR_TAU_MS = 2_500;

/** Vremenska konstanta za slučaj bez traka/brzine (nema se po čemu dead-reckonati). */
const FALLBACK_TAU_MS = 900;

/**
 * Jedan korak prikazane pozicije aviona prema meti iz `extrapolateFlightForDisplay`.
 *
 * Zašto filter, a ne naivno glađenje prema meti: meta sama nije monotona u
 * vremenu. Svaki novi raw fix resetira dead-reckoning bazu, a fix zna biti
 * star nekoliko sekundi iako ga izvor pečati kao "sad" (avionix/Nano to radi
 * sustavno — nema per-aircraft polje starosti kao dump1090-ov `seen_pos`).
 * Meta zato skoči unatrag za onoliko koliko je fix zakasnio. Glađenje prema
 * takvoj meti samo pretvori skok u vidljivo klizanje unatrag — avion koji
 * leti unatrag izgleda jednako pogrešno.
 *
 * Umjesto toga: uvijek pomakni prikazanu poziciju NAPRIJED duž traka za
 * `v·dt`, pa pogrešku prema meti ispravi korekcijom ograničenom na
 * `MAX_CORRECTION_FRACTION` tog pomaka. Neto pomak je time uvijek
 * ≥ `(1 − MAX_CORRECTION_FRACTION)·v·dt > 0` — konvergira prema meti kroz par
 * sekundi, ali nikad unatrag i nikad naglo.
 */
export function advanceDisplayPosition(params: {
  readonly prev: DisplayFix;
  readonly target: { readonly lat: number; readonly lng: number };
  readonly trackDeg: number | null;
  readonly groundSpeedMps: number | null;
  readonly nowMs: number;
  /**
   * Meta stoji jer je fix stariji od `MAX_LEAD_SEC` (ekstrapolacija je
   * kapirana). Tada se ne dead-reckona: prikaz bi inače nastavio letjeti
   * ≥ 0.5·v dalje od mete — do 30 km — pa bi klik (odabrani avion = sama
   * meta) ili snap izgledao kao veliki skok.
   */
  readonly targetFrozen?: boolean;
}): DisplayFix {
  const { prev, target, trackDeg, groundSpeedMps, nowMs } = params;
  const targetFrozen = params.targetFrozen ?? false;

  const dtMs = nowMs - prev.atMs;
  if (dtMs <= 0) return prev;

  const errM = greatCircleDistanceMeters(prev.lat, prev.lng, target.lat, target.lng);
  if (errM >= SNAP_ERROR_METERS) {
    return { lat: target.lat, lng: target.lng, atMs: nowMs };
  }

  const v = groundSpeedMps ?? EXTRAPOLATION_FALLBACK_SPEED_MPS;
  const canDeadReckon =
    trackDeg != null && Number.isFinite(trackDeg) && Number.isFinite(v) && v >= 1;

  if (!canDeadReckon) {
    // Bez smjera/brzine meta je samo sirova pozicija (ekstrapolacija je i sama
    // odustala) — ostaje blago eksponencijalno glađenje.
    const f = 1 - Math.exp(-dtMs / FALLBACK_TAU_MS);
    return {
      lat: prev.lat + (target.lat - prev.lat) * f,
      lng: prev.lng + (target.lng - prev.lng) * f,
      atMs: nowMs,
    };
  }

  // Pomak naprijed prati brzinu METE: dok ona stoji, ni prikaz ne smije bježati.
  const stepM = targetFrozen ? 0 : v * (dtMs / 1000);
  const advanced =
    stepM > 0 ? destinationByAzimuthMeters(prev.lat, prev.lng, trackDeg, stepM) : prev;

  const remainingM = greatCircleDistanceMeters(
    advanced.lat,
    advanced.lng,
    target.lat,
    target.lng
  );
  if (remainingM < 0.001) {
    return { lat: advanced.lat, lng: advanced.lng, atMs: nowMs };
  }

  // Budžet korekcije vezan je uz brzinu aviona (ne mete), da zaostali marker
  // sustigne poziciju i kad meta stoji; za veliku pogrešku raste eksponencijalno.
  const budgetM = Math.max(
    MAX_CORRECTION_FRACTION * v * (dtMs / 1000),
    remainingM * (1 - Math.exp(-dtMs / LARGE_ERROR_TAU_MS))
  );

  // Korekcija razložena na uzdužnu i poprečnu komponentu u odnosu na trak.
  // Unatrag (uzdužno negativno) smije pojesti najviše MAX_CORRECTION_FRACTION
  // pomaka naprijed — marker se nikad ne vraća i uz živu metu nikad ne pada
  // ispod 0.5·v; uz zamrznutu metu (step 0) prikaz koji je ispred mete stoji.
  // Naprijed i bočno smije cijeli budžet.
  const bearing = initialBearingDeg(
    [advanced.lat, advanced.lng],
    [target.lat, target.lng]
  );
  const scale = Math.min(1, budgetM / remainingM);
  const relRad = ((bearing - trackDeg) * Math.PI) / 180;
  const alongM = Math.max(
    -MAX_CORRECTION_FRACTION * stepM,
    remainingM * scale * Math.cos(relRad)
  );
  const crossM = remainingM * scale * Math.sin(relRad);
  const correctionM = Math.hypot(alongM, crossM);
  if (correctionM < 0.001) {
    return { lat: advanced.lat, lng: advanced.lng, atMs: nowMs };
  }
  const corrected = destinationByAzimuthMeters(
    advanced.lat,
    advanced.lng,
    trackDeg + (Math.atan2(crossM, alongM) * 180) / Math.PI,
    correctionM
  );
  return { lat: corrected.lat, lng: corrected.lng, atMs: nowMs };
}
