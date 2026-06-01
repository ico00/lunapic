/**
 * Maps ICAO 3-letter airline designator (first 3 chars of a callsign)
 * to a human-readable carrier name.
 *
 * Sorted by designator for easy maintenance; lookup is done by Map for O(1).
 * Only commonly-seen airlines included — returns "" for unknown designators.
 */
const ICAO_AIRLINES: Record<string, string> = {
  AAL: "American Airlines",
  AAR: "Asiana Airlines",
  ADR: "Adria Airways",
  AEA: "Air Europa",
  AFR: "Air France",
  AHY: "AZAL",
  AIC: "Air India",
  AJM: "Air Arabia",
  AKL: "Air Astana",
  ALK: "SriLankan Airlines",
  ANA: "ANA",
  ANE: "Air Nostrum",
  ANZ: "Air New Zealand",
  APF: "Air Arabia Maroc",
  ATC: "Air Tanzania",
  AUA: "Austrian Airlines",
  AUI: "Ukraine Int'l",
  AUT: "Austral Líneas Aéreas",
  AVA: "Avianca",
  AXB: "Air Arabia",
  AZA: "ITA Airways",
  AZU: "Azul",
  BAW: "British Airways",
  BEL: "Brussels Airlines",
  BER: "Air Berlin",
  BLA: "Blue Air",
  BMA: "British Midland",
  BTI: "airBaltic",
  CAL: "China Airlines",
  CCA: "Air China",
  CFG: "Condor",
  CHH: "Hainan Airlines",
  CKS: "Kalitta Air",
  CLX: "Cargolux",
  CMB: "Combi Air",
  CSN: "China Southern",
  CTN: "Croatia Airlines",
  CXA: "Xiamen Air",
  DAH: "Air Algérie",
  DAN: "Maersk Air",
  DAT: "DAT",
  DLA: "Air Dolomiti",
  DLH: "Lufthansa",
  DSM: "Flydubai",
  EIN: "Aer Lingus",
  EJU: "easyJet Europe",
  ELY: "El Al",
  ETD: "Etihad",
  ETH: "Ethiopian Airlines",
  EUX: "Eastern Airways",
  EVA: "EVA Air",
  EWG: "Eurowings",
  EZS: "easyJet Switzerland",
  EZY: "easyJet",
  FDB: "flydubai",
  FIN: "Finnair",
  FUA: "Futura",
  GEC: "Lufthansa Cargo",
  GFA: "Gulf Air",
  GLL: "Global Air",
  GTI: "Atlas Air",
  HDA: "Druk Air",
  HVN: "Vietnam Airlines",
  IAW: "Iraqi Airways",
  IBE: "Iberia",
  IBS: "Iberia Express",
  ICE: "Icelandair",
  IRA: "Iran Air",
  ISS: "Meridiana",
  JAI: "IndiGo",
  JAL: "Japan Airlines",
  JAT: "Air Serbia",
  JBU: "JetBlue",
  JOR: "Jordan Aviation",
  JSA: "Air One",
  KAC: "Kuwait Airways",
  KAL: "Korean Air",
  KLM: "KLM",
  KQA: "Kenya Airways",
  LAN: "LATAM",
  LDA: "Lauda",
  LGL: "Luxair",
  LNE: "Vueling",
  LOT: "LOT",
  LRC: "Lacsa",
  LZB: "Bulgarian Air Charter",
  MAH: "Malév",
  MAU: "Air Mauritius",
  MAS: "Malaysia Airlines",
  MGL: "MIAT",
  MPH: "Martinair",
  MSR: "Egyptair",
  NAX: "Norwegian",
  NKS: "Spirit Airlines",
  NWA: "Northwest Airlines",
  OAL: "Olympic Air",
  OHY: "Onur Air",
  OMA: "Oman Air",
  OZB: "Transavia France",
  PAL: "Philippine Airlines",
  PGT: "Pegasus",
  PIA: "Pakistan International",
  PKC: "Peach Aviation",
  PVG: "Pobeda",
  QFA: "Qantas",
  QTR: "Qatar Airways",
  RAM: "Royal Air Maroc",
  RBA: "Royal Brunei",
  RJA: "Royal Jordanian",
  RNA: "Air Namibia",
  ROT: "TAROM",
  RRR: "Ryanair",
  RUH: "Fly Baghdad",
  RYR: "Ryanair",
  SAA: "South African Airways",
  SAB: "Sabena",
  SAS: "Scandinavian",
  SIA: "Singapore Airlines",
  SLM: "Surinam Airways",
  SWA: "Southwest Airlines",
  SWR: "Swiss",
  SXS: "SunExpress",
  TAM: "LATAM Brasil",
  TAP: "TAP Air Portugal",
  THA: "Thai Airways",
  THY: "Turkish Airlines",
  TOM: "TUI Airways",
  TUI: "TUI fly",
  TVF: "Transavia",
  TWA: "Trans World Airlines",
  UAE: "Emirates",
  UAL: "United Airlines",
  UIA: "Ukraine Int'l",
  UKL: "Ukraine Int'l",
  UPS: "UPS Airlines",
  VDA: "Volga-Dnepr",
  VJC: "VietJet Air",
  VKG: "Thomas Cook Scandinavia",
  VLG: "Vueling",
  VOE: "Volotea",
  VRD: "Virgin America",
  VUE: "Vueling",
  WDL: "WDL Aviation",
  WIF: "Wideroe",
  WJA: "WestJet",
  WZZ: "Wizz Air",
  XAX: "Airasia X",
};

const AIRLINE_MAP = new Map(Object.entries(ICAO_AIRLINES));

/**
 * Maps ICAO 3-letter designator → flag emoji of the airline's home country.
 * Separate from aircraft registration country — RYR is always 🇮🇪 regardless
 * of which country the individual aircraft is registered in.
 */
const ICAO_AIRLINE_FLAGS: Record<string, string> = {
  AAL: "🇺🇸", // American Airlines
  AAR: "🇰🇷", // Asiana Airlines
  ADR: "🇸🇮", // Adria Airways
  AEA: "🇪🇸", // Air Europa
  AFR: "🇫🇷", // Air France
  AHY: "🇦🇿", // AZAL
  AIC: "🇮🇳", // Air India
  AJM: "🇦🇪", // Air Arabia
  AKL: "🇰🇿", // Air Astana
  ALK: "🇱🇰", // SriLankan Airlines
  ANA: "🇯🇵", // ANA
  ANE: "🇪🇸", // Air Nostrum
  ANZ: "🇳🇿", // Air New Zealand
  APF: "🇲🇦", // Air Arabia Maroc
  ATC: "🇹🇿", // Air Tanzania
  AUA: "🇦🇹", // Austrian Airlines
  AUI: "🇺🇦", // Ukraine Int'l
  AVA: "🇨🇴", // Avianca
  AXB: "🇦🇪", // Air Arabia
  AZA: "🇮🇹", // ITA Airways
  AZU: "🇧🇷", // Azul
  BAW: "🇬🇧", // British Airways
  BEL: "🇧🇪", // Brussels Airlines
  BTI: "🇱🇻", // airBaltic
  CAL: "🇹🇼", // China Airlines
  CCA: "🇨🇳", // Air China
  CFG: "🇩🇪", // Condor
  CHH: "🇨🇳", // Hainan Airlines
  CLX: "🇱🇺", // Cargolux
  CSN: "🇨🇳", // China Southern
  CTN: "🇭🇷", // Croatia Airlines
  CXA: "🇨🇳", // Xiamen Air
  DAH: "🇩🇿", // Air Algérie
  DLA: "🇩🇪", // Air Dolomiti
  DLH: "🇩🇪", // Lufthansa
  EIN: "🇮🇪", // Aer Lingus
  EJU: "🇦🇹", // easyJet Europe (Austrian AOC)
  ELY: "🇮🇱", // El Al
  ETD: "🇦🇪", // Etihad
  ETH: "🇪🇹", // Ethiopian Airlines
  EVA: "🇹🇼", // EVA Air
  EWG: "🇩🇪", // Eurowings
  EZS: "🇨🇭", // easyJet Switzerland
  EZY: "🇬🇧", // easyJet
  FDB: "🇦🇪", // flydubai
  FIN: "🇫🇮", // Finnair
  GEC: "🇩🇪", // Lufthansa Cargo
  GFA: "🇧🇭", // Gulf Air
  GTI: "🇺🇸", // Atlas Air
  HVN: "🇻🇳", // Vietnam Airlines
  IAW: "🇮🇶", // Iraqi Airways
  IBE: "🇪🇸", // Iberia
  IBS: "🇪🇸", // Iberia Express
  ICE: "🇮🇸", // Icelandair
  IRA: "🇮🇷", // Iran Air
  JAI: "🇮🇳", // IndiGo
  JAL: "🇯🇵", // Japan Airlines
  JAT: "🇷🇸", // Air Serbia
  JBU: "🇺🇸", // JetBlue
  KAC: "🇰🇼", // Kuwait Airways
  KAL: "🇰🇷", // Korean Air
  KLM: "🇳🇱", // KLM
  KQA: "🇰🇪", // Kenya Airways
  LAN: "🇨🇱", // LATAM
  LDA: "🇦🇹", // Lauda
  LGL: "🇱🇺", // Luxair
  LOT: "🇵🇱", // LOT
  MAH: "🇭🇺", // Malév
  MAU: "🇲🇺", // Air Mauritius
  MAS: "🇲🇾", // Malaysia Airlines
  MGL: "🇲🇳", // MIAT
  MSR: "🇪🇬", // Egyptair
  NAX: "🇳🇴", // Norwegian
  NKS: "🇺🇸", // Spirit Airlines
  OAL: "🇬🇷", // Olympic Air
  OHY: "🇹🇷", // Onur Air
  OMA: "🇴🇲", // Oman Air
  OZB: "🇫🇷", // Transavia France
  PAL: "🇵🇭", // Philippine Airlines
  PGT: "🇹🇷", // Pegasus
  PIA: "🇵🇰", // Pakistan International
  QFA: "🇦🇺", // Qantas
  QTR: "🇶🇦", // Qatar Airways
  RAM: "🇲🇦", // Royal Air Maroc
  RBA: "🇧🇳", // Royal Brunei
  RJA: "🇯🇴", // Royal Jordanian
  ROT: "🇷🇴", // TAROM
  RRR: "🇮🇪", // Ryanair
  RUH: "🇮🇶", // Fly Baghdad
  RYR: "🇮🇪", // Ryanair
  SAA: "🇿🇦", // South African Airways
  SAS: "🇸🇪", // Scandinavian
  SIA: "🇸🇬", // Singapore Airlines
  SLM: "🇸🇷", // Surinam Airways
  SWA: "🇺🇸", // Southwest Airlines
  SWR: "🇨🇭", // Swiss
  SXS: "🇹🇷", // SunExpress
  TAM: "🇧🇷", // LATAM Brasil
  TAP: "🇵🇹", // TAP Air Portugal
  THA: "🇹🇭", // Thai Airways
  THY: "🇹🇷", // Turkish Airlines
  TOM: "🇬🇧", // TUI Airways
  TUI: "🇧🇪", // TUI fly Belgium
  TVF: "🇫🇷", // Transavia France
  UAE: "🇦🇪", // Emirates
  UAL: "🇺🇸", // United Airlines
  UIA: "🇺🇦", // Ukraine Int'l
  UPS: "🇺🇸", // UPS Airlines
  VDA: "🇷🇺", // Volga-Dnepr
  VJC: "🇻🇳", // VietJet Air
  VLG: "🇪🇸", // Vueling
  VOE: "🇪🇸", // Volotea
  WIF: "🇳🇴", // Wideroe
  WJA: "🇨🇦", // WestJet
  WZZ: "🇭🇺", // Wizz Air
  XAX: "🇲🇾", // Airasia X
};

const AIRLINE_FLAG_MAP = new Map(Object.entries(ICAO_AIRLINE_FLAGS));

/**
 * Derive carrier name from the first 3 characters of an ADS-B callsign.
 * Returns "" when callsign is null/short/unknown.
 */
export function callsignToCarrier(callsign: string | null | undefined): string {
  if (!callsign || callsign.length < 3) return "";
  const designator = callsign.slice(0, 3).toUpperCase();
  return AIRLINE_MAP.get(designator) ?? "";
}

/**
 * Derive the airline's home-country flag from the ICAO designator (first 3 chars
 * of a callsign). Returns "" when the designator is not in the lookup table.
 *
 * This shows the airline's nationality, NOT the individual aircraft's registration
 * country. Use this when you want Ryanair to always show 🇮🇪 regardless of whether
 * the specific airframe has an EI-, TC-, or PH- registration.
 */
export function callsignToAirlineFlag(callsign: string | null | undefined): string {
  if (!callsign || callsign.length < 3) return "";
  const designator = callsign.slice(0, 3).toUpperCase();
  return AIRLINE_FLAG_MAP.get(designator) ?? "";
}
