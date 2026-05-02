import { adsbEmitterCategoryLabel } from "@/lib/flight/opensky/emitterCategory";
import type { FlightState } from "@/types/flight";

/** ICAO airline designator (3 znaka) → javno ime — nepotpuna lista, Europa + česti prijevoznici. */
const AIRLINE_ICAO_NAMES: Readonly<Record<string, string>> = {
  AAL: "American Airlines",
  ACA: "Air Canada",
  AEA: "Air Europa",
  AFR: "Air France",
  AMX: "Aeroméxico",
  ASA: "Alaska Airlines",
  AUA: "Austrian Airlines",
  AZA: "ITA Airways",
  BAW: "British Airways",
  BEL: "Brussels Airlines",
  CFG: "Condor",
  CHH: "Hainan Airlines",
  CSA: "Czech Airlines",
  CTA: "Croatia Airlines",
  DAL: "Delta Air Lines",
  DLH: "Lufthansa",
  EAI: "Emerald Airlines",
  EIN: "Aer Lingus",
  ENY: "American Eagle (Envoy)",
  ETD: "Etihad Airways",
  EJU: "easyJet Europe",
  EWG: "Eurowings",
  EZS: "easyJet Switzerland",
  EZY: "easyJet",
  FIN: "Finnair",
  FPO: "ASL Airlines France",
  GWI: "Discover Airlines",
  HAL: "Hawaiian Airlines",
  IBE: "Iberia",
  JBU: "JetBlue",
  JAL: "Japan Airlines",
  KLM: "KLM",
  LAN: "LATAM Airlines",
  LOT: "LOT Polish Airlines",
  LXJ: "Flexjet",
  MGL: "MIAT Mongolian Airlines",
  NAX: "Norwegian",
  NOZ: "Norwegian Air Shuttle",
  OAL: "Olympic Air",
  OAW: "Helvetic Airways",
  POE: "Porter Airlines",
  QTR: "Qatar Airways",
  RYR: "Ryanair",
  SAS: "SAS Scandinavian Airlines",
  SHT: "British Airways (Shuttle)",
  SWR: "Swiss",
  TAP: "TAP Air Portugal",
  TGZ: "Georgian Airways",
  THY: "Turkish Airlines",
  UAL: "United Airlines",
  UIA: "Ukraine International Airlines",
  ULA: "Airlink",
  VIR: "Virgin Atlantic",
  VLG: "Vueling",
  WMT: "Wizz Air Malta",
  WZZ: "Wizz Air",
};

function normalizeIcaoKey(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 3);
}

/**
 * ICAO airline (3 znaka) → IATA (2 znaka) za `images.kiwi.com` PNG logotipe.
 * Samo prijevoznici iz {@link AIRLINE_ICAO_NAMES}; inače `null` (UI ostavlja prazan slot).
 */
const AIRLINE_ICAO_TO_IATA_LOGO: Readonly<Record<string, string>> = {
  AAL: "AA",
  ACA: "AC",
  AEA: "UX",
  AFR: "AF",
  AMX: "AM",
  ASA: "AS",
  AUA: "OS",
  AZA: "IT",
  BAW: "BA",
  BEL: "SN",
  CFG: "DE",
  CHH: "HU",
  CSA: "OK",
  CTA: "OU",
  DAL: "DL",
  DLH: "LH",
  EAI: "EA",
  EIN: "EI",
  ENY: "MQ",
  ETD: "EY",
  EJU: "EC",
  EWG: "EW",
  EZS: "DS",
  EZY: "U2",
  FIN: "AY",
  FPO: "5O",
  GWI: "4Y",
  HAL: "HA",
  IBE: "IB",
  JBU: "B6",
  JAL: "JL",
  KLM: "KL",
  LAN: "LA",
  LOT: "LO",
  LXJ: "1I",
  MGL: "OM",
  NAX: "DY",
  NOZ: "DY",
  OAL: "OA",
  OAW: "2L",
  POE: "PD",
  QTR: "QR",
  RYR: "FR",
  SAS: "SK",
  SHT: "BA",
  SWR: "LX",
  TAP: "TP",
  TGZ: "A9",
  THY: "TK",
  UAL: "UA",
  UIA: "PS",
  ULA: "4Z",
  VIR: "VS",
  VLG: "VY",
  WMT: "W4",
  WZZ: "W6",
};

/** ICAO designator (3 slova) iz polja ili prefiksa callsigna, kao u OpenSky parseru. */
function airlineIcao3FromFlight(f: FlightState): string | null {
  const fromField = f.airlineIcao?.trim();
  if (fromField && /^[A-Za-z]{3}$/.test(fromField)) {
    return fromField.toUpperCase().slice(0, 3);
  }
  const cs = f.callSign?.trim();
  if (cs && cs.length >= 3) {
    const raw = cs.slice(0, 3);
    if (/^[A-Za-z]{3}$/.test(raw)) {
      return raw.toUpperCase();
    }
  }
  return null;
}

/** IATA kod za Kiwi CDN logo, ili `null` ako nemamo pouzdanog para u mapi. */
export function flightAirlineLogoKiwiIata(f: FlightState): string | null {
  const icao3 = airlineIcao3FromFlight(f);
  if (!icao3) {
    return null;
  }
  return AIRLINE_ICAO_TO_IATA_LOGO[icao3] ?? null;
}

/**
 * Jedna linija za UI: eksplicitno ime, inače lookup ICAO (prva 3 znaka callsigna), inače ICAO + zemlja.
 */
export function flightAirlineDisplayLine(f: FlightState): string | null {
  const explicit = f.airlineName?.trim();
  if (explicit) {
    return explicit;
  }
  const icaoRaw = f.airlineIcao?.trim();
  const country = f.originCountry?.trim();
  if (!icaoRaw && !country) {
    return null;
  }
  const icao = icaoRaw ? normalizeIcaoKey(icaoRaw) : "";
  if (icao.length === 3) {
    const name = AIRLINE_ICAO_NAMES[icao];
    if (name) {
      return name;
    }
  }
  if (icao && country) {
    return `${icao} · ${country}`;
  }
  return icao || country || null;
}

/**
 * Jedna linija za UI: eksplicitni tip zrakoplova, inače ADS-B klasa.
 */
export function flightAircraftTypeDisplayLine(f: FlightState): string | null {
  const explicit = f.aircraftType?.trim();
  if (explicit) {
    return explicit;
  }
  return adsbEmitterCategoryLabel(f.adsbEmitterCategory);
}
