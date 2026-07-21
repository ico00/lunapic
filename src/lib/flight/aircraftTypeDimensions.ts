/**
 * Stvarne dimenzije zrakoplova po ICAO type designatoru (Doc 8643 typecode,
 * npr. `A320`, `B738`) — izvor za `FlightState.wingspanMeters` / `lengthMeters`
 * umjesto paušalnih 40 m u geometriji (shot feasibility, viewfinder, transit
 * duration).
 *
 * Typecode dolazi iz lokalnog OpenSky aircraft indeksa
 * (`public/data/opensky-aircraft/`, tuple[0] — vidi
 * `openskyAircraftIndexShard.ts`). Vrijednosti su iz javnih specifikacija
 * proizvođača (±dm točnost je dovoljna: na 50 km 1 m raspona ≈ 0.001°).
 */

export type AircraftDimensions = {
  /** Raspon krila u metrima. */
  readonly wingspanMeters: number;
  /** Duljina trupa u metrima. */
  readonly lengthMeters: number;
};

function dims(wingspanMeters: number, lengthMeters: number): AircraftDimensions {
  return { wingspanMeters, lengthMeters };
}

/**
 * ICAO typecode → dimenzije. Pokriva tipove koji čine praktički sav promet
 * vidljiv iznad Hrvatske (komercijalni + česti biz/GA). Varijante bez unosa
 * hvata obiteljski fallback u {@link resolveAircraftDimensionsByTypecode}.
 */
const AIRCRAFT_TYPE_DIMENSIONS: Readonly<Record<string, AircraftDimensions>> = {
  // --- Airbus uskotrupni ---
  A318: dims(34.1, 31.4),
  A319: dims(34.1, 33.8),
  A19N: dims(35.8, 33.8),
  A320: dims(35.8, 37.6),
  A20N: dims(35.8, 37.6),
  A321: dims(35.8, 44.5),
  A21N: dims(35.8, 44.5),
  // --- Airbus širokotrupni ---
  A306: dims(44.8, 54.1),
  A310: dims(43.9, 46.7),
  A332: dims(60.3, 58.8),
  A333: dims(60.3, 63.7),
  A338: dims(64.0, 59.0),
  A339: dims(64.0, 63.7),
  A342: dims(60.3, 59.4),
  A343: dims(60.3, 63.7),
  A345: dims(63.5, 67.9),
  A346: dims(63.5, 75.4),
  A359: dims(64.8, 66.8),
  A35K: dims(64.8, 73.8),
  A388: dims(79.8, 72.7),
  // --- Boeing 737 ---
  B733: dims(28.9, 33.4),
  B734: dims(28.9, 36.4),
  B735: dims(28.9, 31.0),
  B736: dims(35.8, 31.2),
  B737: dims(35.8, 33.6),
  B738: dims(35.8, 39.5),
  B739: dims(35.8, 42.1),
  B37M: dims(35.9, 35.6),
  B38M: dims(35.9, 39.5),
  B39M: dims(35.9, 42.2),
  B3XM: dims(35.9, 43.8),
  // --- Boeing ostali ---
  B712: dims(28.5, 37.8),
  B722: dims(32.9, 46.7),
  B741: dims(59.6, 70.7),
  B742: dims(59.6, 70.7),
  B743: dims(59.6, 70.7),
  B744: dims(64.4, 70.7),
  B748: dims(68.4, 76.3),
  B752: dims(38.1, 47.3),
  B753: dims(38.1, 54.4),
  B762: dims(47.6, 48.5),
  B763: dims(47.6, 54.9),
  B764: dims(51.9, 61.4),
  B772: dims(60.9, 63.7),
  B773: dims(60.9, 73.9),
  B77L: dims(64.8, 63.7),
  B77W: dims(64.8, 73.9),
  B788: dims(60.1, 56.7),
  B789: dims(60.1, 62.8),
  B78X: dims(60.1, 68.3),
  // --- Airbus A220 (Bombardier CSeries) ---
  BCS1: dims(35.1, 35.0),
  BCS3: dims(35.1, 38.7),
  // --- Embraer ---
  E135: dims(20.0, 26.3),
  E145: dims(20.0, 29.9),
  E45X: dims(20.0, 29.9),
  E170: dims(26.0, 29.9),
  E175: dims(28.7, 31.7),
  E190: dims(28.7, 36.2),
  E195: dims(28.7, 38.7),
  E290: dims(33.7, 36.2),
  E295: dims(35.1, 41.5),
  // --- Bombardier CRJ ---
  CRJ1: dims(21.2, 26.8),
  CRJ2: dims(21.2, 26.8),
  CRJ7: dims(23.2, 32.5),
  CRJ9: dims(24.9, 36.4),
  CRJX: dims(26.2, 39.1),
  // --- Turboprop regionalni ---
  AT43: dims(24.6, 22.7),
  AT45: dims(24.6, 22.7),
  AT46: dims(24.6, 22.7),
  AT72: dims(27.1, 27.2),
  AT73: dims(27.1, 27.2),
  AT75: dims(27.1, 27.2),
  AT76: dims(27.1, 27.2),
  DH8A: dims(25.9, 22.3),
  DH8B: dims(25.9, 22.3),
  DH8C: dims(27.4, 25.7),
  DH8D: dims(28.4, 32.8),
  SF34: dims(21.4, 19.7),
  SB20: dims(24.8, 27.3),
  JS32: dims(15.9, 14.4),
  JS41: dims(18.3, 19.3),
  D328: dims(21.0, 21.1),
  J328: dims(21.0, 21.1),
  F50: dims(29.0, 25.2),
  L410: dims(20.0, 14.4),
  AN26: dims(29.2, 23.8),
  // --- Ostali mlazni putnički ---
  SU95: dims(27.8, 29.9),
  F70: dims(28.1, 30.9),
  F100: dims(28.1, 35.5),
  RJ85: dims(26.3, 28.6),
  RJ1H: dims(26.3, 31.0),
  B461: dims(26.3, 26.2),
  B462: dims(26.3, 28.6),
  B463: dims(26.3, 31.0),
  MD82: dims(32.9, 45.0),
  MD83: dims(32.9, 45.0),
  MD87: dims(32.9, 39.8),
  MD88: dims(32.9, 45.0),
  MD90: dims(32.9, 46.5),
  // --- Teretni / vojni transport ---
  MD11: dims(52.0, 61.6),
  A124: dims(73.3, 69.1),
  AN12: dims(38.0, 33.1),
  IL76: dims(50.5, 46.6),
  A400: dims(42.4, 45.1),
  C130: dims(40.4, 29.8),
  C30J: dims(40.4, 29.8),
  C17: dims(51.7, 53.0),
  K35R: dims(39.9, 41.5),
  // --- Poslovni mlazni ---
  GLF4: dims(23.7, 26.9),
  GLF5: dims(28.5, 29.4),
  GLF6: dims(30.4, 30.4),
  GLEX: dims(28.7, 30.3),
  GL7T: dims(31.7, 33.8),
  CL60: dims(19.6, 20.9),
  CL30: dims(19.5, 20.9),
  CL35: dims(19.5, 20.9),
  C525: dims(14.3, 13.0),
  C25A: dims(15.2, 14.5),
  C25B: dims(16.3, 15.6),
  C25C: dims(15.5, 16.3),
  C550: dims(15.9, 14.4),
  C560: dims(16.3, 14.9),
  C56X: dims(17.0, 15.8),
  C680: dims(19.2, 19.4),
  C68A: dims(22.1, 19.0),
  C700: dims(23.1, 22.3),
  C750: dims(19.4, 22.0),
  E50P: dims(12.3, 12.8),
  E55P: dims(16.2, 15.9),
  E545: dims(20.3, 19.7),
  E550: dims(20.3, 20.7),
  F2TH: dims(21.4, 20.2),
  FA50: dims(18.9, 18.5),
  F900: dims(19.3, 20.2),
  FA7X: dims(26.2, 23.4),
  FA8X: dims(26.3, 24.5),
  LJ45: dims(14.6, 17.7),
  LJ60: dims(13.4, 17.9),
  H25B: dims(15.7, 15.6),
  PC24: dims(17.0, 16.8),
  // --- Turboprop biz / GA ---
  PC12: dims(16.3, 14.4),
  TBM7: dims(12.7, 10.6),
  TBM8: dims(12.7, 10.6),
  TBM9: dims(12.8, 10.7),
  BE20: dims(16.6, 13.3),
  B350: dims(17.7, 14.2),
  BE9L: dims(15.3, 10.8),
  C208: dims(15.9, 11.5),
  // --- GA klipni ---
  C152: dims(10.1, 7.3),
  C172: dims(11.0, 8.3),
  C182: dims(11.0, 8.8),
  C206: dims(11.0, 8.6),
  C210: dims(11.2, 8.6),
  P28A: dims(10.8, 7.3),
  P28R: dims(10.8, 7.5),
  PA34: dims(11.9, 8.7),
  PA31: dims(12.4, 9.9),
  PA46: dims(13.1, 8.8),
  BE33: dims(10.2, 8.1),
  BE35: dims(10.2, 8.1),
  BE36: dims(10.2, 8.4),
  BE58: dims(11.5, 9.1),
  DA40: dims(11.9, 8.0),
  DA42: dims(13.6, 8.6),
  DA62: dims(14.6, 9.2),
  DV20: dims(10.9, 7.3),
  SR20: dims(11.7, 7.9),
  SR22: dims(11.7, 7.9),
  M20P: dims(11.0, 8.2),
  PIVI: dims(10.7, 6.4),
};

/**
 * Obiteljski fallback: nepoznata varijanta (npr. `B37H`, retrofit podtip) pada
 * na reprezentativnog člana obitelji po prefiksu typecodea. Redoslijed bitan —
 * prvi pogodak pobjeđuje.
 */
const FAMILY_PREFIX_FALLBACK: readonly (readonly [string, string])[] = [
  ["A31", "A319"],
  ["A32", "A320"],
  ["A33", "A333"],
  ["A34", "A343"],
  ["A35", "A359"],
  ["B73", "B738"],
  ["B74", "B744"],
  ["B75", "B752"],
  ["B76", "B763"],
  ["B77", "B772"],
  ["B78", "B789"],
  ["BCS", "BCS3"],
  ["E17", "E175"],
  ["E19", "E190"],
  ["CRJ", "CRJ9"],
  ["AT4", "AT45"],
  ["AT7", "AT72"],
  ["DH8", "DH8D"],
  ["MD8", "MD82"],
];

/**
 * ICAO aircraft type descriptor (npr. `L2J`) — OpenSky indeks ga koristi kao
 * fallback u tuple[0] kad typecode nedostaje. Nije typecode, nema dimenzije.
 */
const ICAO_CATEGORY_DESCRIPTOR = /^[ALSTHG]\d[JTPE]$/;

/**
 * Dimenzije po ICAO typecodeu, s obiteljskim fallbackom. `null` kad je unos
 * prazan, kategorija-deskriptor (`L2J`) ili nepoznat tip — pozivatelj tada
 * zadržava postojeće heuristike (default 40 m).
 */
export function resolveAircraftDimensionsByTypecode(
  typecode: string | null | undefined
): AircraftDimensions | null {
  const code = (typecode ?? "").trim().toUpperCase();
  if (!code || ICAO_CATEGORY_DESCRIPTOR.test(code)) {
    return null;
  }
  const exact = AIRCRAFT_TYPE_DIMENSIONS[code];
  if (exact) {
    return exact;
  }
  for (const [prefix, representative] of FAMILY_PREFIX_FALLBACK) {
    if (code.startsWith(prefix)) {
      return AIRCRAFT_TYPE_DIMENSIONS[representative] ?? null;
    }
  }
  return null;
}
