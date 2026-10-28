import { canonicalIcao24Id } from "@/lib/flight/icao24CanonicalId";
import { mergeStickyFlightMetadata } from "@/lib/flight/mergeStickyFlightMetadata";
import type { FlightState } from "@/types/flight";

function withCanonicalId(f: FlightState): FlightState {
  const id = canonicalIcao24Id(f.id);
  return {
    ...f,
    id,
    icao24: f.icao24 != null ? canonicalIcao24Id(String(f.icao24)) : id,
  };
}

/**
 * Dva snimka istog `id` (ICAO24): noviji `timestamp` kao geometrija, metapodaci
 * se lijepe kao u {@link mergeStickyFlightMetadata}.
 */
export function mergeTwoLiveFlightSnapshots(
  a: FlightState,
  b: FlightState
): FlightState {
  const newerFirst = a.timestamp >= b.timestamp;
  const primary = newerFirst ? a : b;
  const secondary = newerFirst ? b : a;
  return mergeStickyFlightMetadata([primary], [secondary])[0];
}

/**
 * Spaja više listi iz live izvora u jednu mapu po `flight.id` (ICAO24).
 */
export function mergeLiveFlightLists(
  lists: readonly (readonly FlightState[])[]
): readonly FlightState[] {
  if (lists.length === 0) {
    return [];
  }
  if (lists.length === 1) {
    return lists[0];
  }
  const byId = new Map<string, FlightState>();
  for (const list of lists) {
    for (const f of list) {
      const fNorm = withCanonicalId(f);
      const key = fNorm.id;
      const cur = byId.get(key);
      if (cur == null) {
        byId.set(key, fNorm);
      } else {
        byId.set(key, mergeTwoLiveFlightSnapshots(cur, fNorm));
      }
    }
  }
  return [...byId.values()];
}

/**
 * Kao `mergeLiveFlightLists`, ali lokalni SDR ima apsolutni prioritet: za svaki
 * zrakoplov prisutan u SDR listi koristi se SDR geometrija (pozicija, visina,
 * brzina, kurs); metapodaci koji nedostaju (tip aviona, airline) popunjavaju se
 * iz web API-ja. Zrakoplovi vidljivi samo na SDR dodaju se bez izmjena.
 */
export function mergeLiveFlightListsWithSdrPriority(
  sdrList: readonly FlightState[],
  webLists: readonly (readonly FlightState[])[],
  nowMs: number = Date.now()
): readonly FlightState[] {
  const webMerged = mergeLiveFlightLists(webLists);

  if (sdrList.length === 0) return webMerged;

  const sdrById = new Map<string, FlightState>();
  for (const f of sdrList) {
    const fNorm = withCanonicalId(f);
    sdrById.set(fNorm.id, fNorm);
  }

  const result = new Map<string, FlightState>();
  for (const f of webMerged) {
    const sdr = sdrById.get(f.id);
    if (sdr) {
      // SDR wins for geometry; web fills metadata gaps (aircraftType, airlineName…)
      // i kinematiku koju lokalni redak nema (position-only ADS-B poruka).
      result.set(
        f.id,
        withBorrowedKinematics(mergeStickyFlightMetadata([sdr], [f])[0], f, nowMs)
      );
    } else {
      result.set(f.id, f);
    }
  }
  for (const [id, f] of sdrById) {
    if (!result.has(id)) result.set(id, f);
  }

  return [...result.values()];
}

/**
 * Iznad ove starosti lokalni fix prestaje biti autoritet za svoj icao24 — drugi
 * lokalni prijemnik smije preuzeti avion.
 *
 * Zašto uopće: tar1090 (`aircraft.json`) drži avion u odgovoru i nakon što mu
 * prestane stizati signal — samo raste `seen_pos`. Mjereno na živom feedu
 * (2026-08-25, 431 redaka kroz 2 min): **12.3 %** redaka je starije od 25 s, a
 * **7 %** starije od 40 s, što je iznad `MAX_LEAD_SEC` u
 * `extrapolateFlightPosition` — takav marker se doslovno zamrzne. Dok je fiksni
 * prioritet bio bezuvjetan, Avionix nije smio preuzeti takav avion iako je za
 * njega imao svjež fix.
 *
 * 15 s je odabrano jer dead-reckoning po track/brzini dotad drži grešku ispod
 * ~100 m (izmjerena p50 razlika između dva prijemnika), pa preuzimanje ispod
 * tog praga ne bi kupilo točnost — samo bi vratilo treperenje zbog kojeg je
 * fiksni prioritet i uveden (#36).
 */
export const LOCAL_FEED_TAKEOVER_AFTER_MS = 15_000;

/**
 * Najstariji snimak iz kojeg se još smije posuditi kinematika/visina. Track i
 * brzina se mijenjaju sporo, ali posuđivanje iz proizvoljno starog snimka bi
 * značilo dead-reckoning po kursu kojim avion odavno ne leti.
 */
const KINEMATICS_BORROW_MAX_AGE_MS = 60_000;

/**
 * Ima li snimak ono što treba za dead-reckoning i za `timeToAlignmentSec`.
 * Bez track-a `photographerPack` pada na default 90° i ili izbaci let iz
 * kandidata ili mu izračuna lažno odbrojavanje, a `extrapolateFlightForDisplay`
 * ga uopće ne pomiče — marker stoji dok mu odbrojavanje nestane iz panela.
 */
function hasUsableKinematics(f: FlightState): boolean {
  return (
    f.trackDeg != null &&
    Number.isFinite(f.trackDeg) &&
    f.groundSpeedMps != null &&
    Number.isFinite(f.groundSpeedMps)
  );
}

function localFeedRank(providerId: FlightState["providerId"]): number {
  // Fiksni tiebreak kad su oba snimka jednako upotrebljiva: bez njega bi se za
  // avion koji vide oba prijemnika svaki tick biralo naizmjenično, a razlika u
  // dekodiranoj poziciji (p50 ~100 m) postala bi vidljivo treperenje.
  return providerId === "localsdr" ? 2 : providerId === "avionix" ? 1 : 0;
}

/**
 * Koji od dva snimka istog aviona vodi geometriju. Deterministički i simetričan
 * — `pickFreshestLocalSnapshot(a, b)` i `(b, a)` daju isti rezultat.
 */
export function pickFreshestLocalSnapshot(
  a: FlightState,
  b: FlightState,
  nowMs: number
): { readonly winner: FlightState; readonly loser: FlightState } {
  const aUsable = hasUsableKinematics(a);
  const bUsable = hasUsableKinematics(b);
  if (aUsable !== bUsable) {
    return aUsable ? { winner: a, loser: b } : { winner: b, loser: a };
  }

  const aStale = nowMs - a.timestamp > LOCAL_FEED_TAKEOVER_AFTER_MS;
  const bStale = nowMs - b.timestamp > LOCAL_FEED_TAKEOVER_AFTER_MS;
  if (aStale !== bStale) {
    return aStale ? { winner: b, loser: a } : { winner: a, loser: b };
  }
  if (aStale && bStale) {
    // Oba mrtva — barem uzmi manje mrtvog.
    return a.timestamp >= b.timestamp
      ? { winner: a, loser: b }
      : { winner: b, loser: a };
  }

  const rankA = localFeedRank(a.providerId);
  const rankB = localFeedRank(b.providerId);
  if (rankA !== rankB) {
    return rankA > rankB ? { winner: a, loser: b } : { winner: b, loser: a };
  }
  return a.timestamp >= b.timestamp
    ? { winner: a, loser: b }
    : { winner: b, loser: a };
}

/**
 * Popuni kinematiku/visinu koje pobjednik nema iz drugog snimka istog aviona.
 * Position-only ADS-B redak (0.4 % redaka na živom feedu) inače ubije
 * `timeToAlignmentSec` i zamrzne marker iako drugi izvor u istom trenutku ima
 * i kurs i brzinu.
 */
export function withBorrowedKinematics(
  base: FlightState,
  donor: FlightState | undefined,
  nowMs: number
): FlightState {
  if (donor == null) {
    return base;
  }
  if (nowMs - donor.timestamp > KINEMATICS_BORROW_MAX_AGE_MS) {
    return base;
  }
  const trackDeg = base.trackDeg ?? donor.trackDeg;
  const groundSpeedMps = base.groundSpeedMps ?? donor.groundSpeedMps;
  const baroAltitudeMeters = base.baroAltitudeMeters ?? donor.baroAltitudeMeters;
  const geoAltitudeMeters = base.geoAltitudeMeters ?? donor.geoAltitudeMeters;
  if (
    trackDeg === base.trackDeg &&
    groundSpeedMps === base.groundSpeedMps &&
    baroAltitudeMeters === base.baroAltitudeMeters &&
    geoAltitudeMeters === base.geoAltitudeMeters
  ) {
    return base;
  }
  return {
    ...base,
    trackDeg,
    groundSpeedMps,
    baroAltitudeMeters,
    geoAltitudeMeters,
  };
}

/** Pobjednik + metapodaci i kinematika posuđeni od gubitnika. */
function combineLocalSnapshots(
  a: FlightState,
  b: FlightState,
  nowMs: number
): FlightState {
  const { winner, loser } = pickFreshestLocalSnapshot(a, b, nowMs);
  return withBorrowedKinematics(
    mergeStickyFlightMetadata([winner], [loser])[0],
    loser,
    nowMs
  );
}

/**
 * Spaja dva **lokalna** prijemnika (Pi + Avionix) u jednu listu. Za avion koji
 * vide oba geometriju vodi svježiji/potpuniji snimak (vidi
 * {@link pickFreshestLocalSnapshot}), uz fiksni tiebreak u korist `localsdr`
 * dok su oba jednako svježa.
 */
export function mergeLocalFeeds(
  a: readonly FlightState[],
  b: readonly FlightState[],
  nowMs: number
): readonly FlightState[] {
  if (a.length === 0) return b.map(withCanonicalId);
  if (b.length === 0) return a.map(withCanonicalId);

  const byId = new Map<string, FlightState>();
  for (const f of a) {
    const fNorm = withCanonicalId(f);
    byId.set(fNorm.id, fNorm);
  }
  for (const f of b) {
    const fNorm = withCanonicalId(f);
    const cur = byId.get(fNorm.id);
    byId.set(fNorm.id, cur == null ? fNorm : combineLocalSnapshots(cur, fNorm, nowMs));
  }
  return [...byId.values()];
}

/**
 * Brzi tick jednog lokalnog izvora (10 s): `fresh` se upisuje preko zadnjeg
 * poznatog stanja, ali NE gazi avion koji trenutno drži **drugi** lokalni
 * prijemnik dok je njegov fix još svjež — ista odluka kao na punom ticku, pa se
 * izvor ne prebacuje tamo-natrag između tickova.
 *
 * Prije je isto rješavao filter „izbaci iz avionix liste sve što je zadnje
 * javio localsdr”: kad bi Pi izgubio avion, Avionix ga nije smio preuzeti do
 * idućeg **punog** ticka, pa je marker znao stajati do 30 s i onda skočiti.
 */
export function mergeLocalFeedTickIntoPrevious(
  fresh: readonly FlightState[],
  previous: readonly FlightState[],
  nowMs: number
): readonly FlightState[] {
  const byId = new Map<string, FlightState>();
  for (const f of previous) {
    const fNorm = withCanonicalId(f);
    byId.set(fNorm.id, fNorm);
  }
  for (const f of fresh) {
    const fNorm = withCanonicalId(f);
    const prev = byId.get(fNorm.id);
    if (prev == null) {
      byId.set(fNorm.id, fNorm);
      continue;
    }
    const bothLocal =
      localFeedRank(prev.providerId) > 0 && localFeedRank(fNorm.providerId) > 0;
    if (bothLocal && prev.providerId !== fNorm.providerId) {
      byId.set(fNorm.id, combineLocalSnapshots(prev, fNorm, nowMs));
      continue;
    }
    // Isti izvor (ili prethodni je web): svjež podatak vodi, staro popunjava rupe.
    byId.set(
      fNorm.id,
      withBorrowedKinematics(
        mergeStickyFlightMetadata([fNorm], [prev])[0],
        prev,
        nowMs
      )
    );
  }
  return [...byId.values()];
}
