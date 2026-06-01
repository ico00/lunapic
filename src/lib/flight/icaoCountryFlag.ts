/**
 * Maps aircraft registration prefix to a country flag emoji.
 * Sorted longest-first so that multi-char prefixes take priority.
 */
const PREFIX_FLAG: [string, string][] = [
  ["9A", "🇭🇷"], // Croatia
  ["9H", "🇲🇹"], // Malta
  ["A6", "🇦🇪"], // UAE
  ["A9C","🇧🇭"], // Bahrain
  ["AP", "🇵🇰"], // Pakistan
  ["B", "🇨🇳"],  // China (B + digits)
  ["C-", "🇨🇦"], // Canada
  ["CS", "🇵🇹"], // Portugal
  ["D-", "🇩🇪"], // Germany
  ["EC", "🇪🇸"], // Spain
  ["EI", "🇮🇪"], // Ireland
  ["EK", "🇦🇲"], // Armenia
  ["EP", "🇮🇷"], // Iran
  ["ES", "🇪🇪"], // Estonia
  ["ET", "🇪🇹"], // Ethiopia
  ["EW", "🇧🇾"], // Belarus
  ["F-", "🇫🇷"], // France
  ["G-", "🇬🇧"], // UK
  ["HA", "🇭🇺"], // Hungary
  ["HB", "🇨🇭"], // Switzerland
  ["HK", "🇨🇴"], // Colombia
  ["I-", "🇮🇹"], // Italy
  ["JA", "🇯🇵"], // Japan
  ["LN", "🇳🇴"], // Norway
  ["LQ", "🇧🇦"], // Bosnia and Herzegovina
  ["LY", "🇱🇹"], // Lithuania
  ["LZ", "🇧🇬"], // Bulgaria
  ["N", "🇺🇸"],  // USA (single N)
  ["OB", "🇵🇪"], // Peru
  ["OE", "🇦🇹"], // Austria
  ["OH", "🇫🇮"], // Finland
  ["OK", "🇨🇿"], // Czechia
  ["OO", "🇧🇪"], // Belgium
  ["OY", "🇩🇰"], // Denmark
  ["PH", "🇳🇱"], // Netherlands
  ["PK", "🇮🇩"], // Indonesia
  ["PZ", "🇸🇷"], // Suriname
  ["RA", "🇷🇺"], // Russia
  ["S2", "🇧🇩"], // Bangladesh
  ["S5", "🇸🇮"], // Slovenia
  ["SE", "🇸🇪"], // Sweden
  ["SL", "🇧🇴"], // Bolivia
  ["SP", "🇵🇱"], // Poland
  ["ST", "🇸🇩"], // Sudan
  ["SX", "🇬🇷"], // Greece
  ["T7", "🇸🇲"], // San Marino
  ["TC", "🇹🇷"], // Turkey
  ["TF", "🇮🇸"], // Iceland
  ["TJ", "🇨🇲"], // Cameroon
  ["TS", "🇹🇳"], // Tunisia
  ["UR", "🇺🇦"], // Ukraine
  ["VH", "🇦🇺"], // Australia
  ["VP-B","🇰🇾"],// Cayman Islands
  ["VT", "🇮🇳"], // India
  ["XA", "🇲🇽"], // Mexico
  ["YI", "🇮🇶"], // Iraq
  ["YK", "🇸🇾"], // Syria
  ["YL", "🇱🇻"], // Latvia
  ["YR", "🇷🇴"], // Romania
  ["YU", "🇷🇸"], // Serbia
  ["Z3", "🇲🇰"], // North Macedonia
  ["ZK", "🇳🇿"], // New Zealand
  ["ZS", "🇿🇦"], // South Africa
];

/** Sorted longest-first to ensure multi-char prefixes match first. */
const SORTED = [...PREFIX_FLAG].sort((a, b) => b[0].length - a[0].length);

export function registrationToFlag(reg: string | null | undefined): string {
  if (!reg) return "";
  const upper = reg.toUpperCase().replace(/[-\s]/g, "");
  for (const [prefix, flag] of SORTED) {
    const key = prefix.replace("-", "");
    if (upper.startsWith(key)) return flag;
  }
  return "";
}

/** Derive flag from ICAO24 hex address when registration is unavailable. */
const ICAO24_RANGES: [number, number, string][] = [
  [0x380000, 0x3bffff, "🇫🇷"],
  [0x3c0000, 0x3fffff, "🇩🇪"],
  [0x400000, 0x43ffff, "🇬🇧"],
  [0x440000, 0x447fff, "🇦🇹"],
  [0x448000, 0x44ffff, "🇧🇪"],
  [0x450000, 0x457fff, "🇧🇬"],
  [0x458000, 0x45ffff, "🇩🇰"],
  [0x460000, 0x467fff, "🇪🇸"],
  [0x468000, 0x46ffff, "🇫🇮"],
  [0x470000, 0x477fff, "🇬🇷"],
  [0x478000, 0x47ffff, "🇭🇺"],
  [0x480000, 0x487fff, "🇳🇴"],
  [0x488000, 0x48ffff, "🇳🇱"],
  [0x490000, 0x497fff, "🇵🇱"],
  [0x498000, 0x49ffff, "🇵🇹"],
  [0x4a0000, 0x4a7fff, "🇨🇿"],
  [0x4b0000, 0x4b7fff, "🇷🇴"],
  [0x4c0000, 0x4c7fff, "🇸🇪"],
  [0x4ca000, 0x4cbfff, "🇮🇪"],
  [0x4d0000, 0x4d7fff, "🇹🇷"],
  [0x4d2000, 0x4d23ff, "🇨🇭"],
  [0x500000, 0x5003ff, "🇭🇷"],
  [0x501000, 0x5013ff, "🇭🇷"],
  [0x502000, 0x5023ff, "🇸🇮"],
  [0x503000, 0x5033ff, "🇧🇦"],
  [0x504000, 0x5043ff, "🇷🇸"],
  [0x505000, 0x5053ff, "🇲🇰"],
  [0x700000, 0x700fff, "🇮🇶"],
  [0x710000, 0x717fff, "🇸🇦"],
  [0xa00000, 0xafffff, "🇺🇸"],
  [0xc00000, 0xc3ffff, "🇨🇦"],
  [0xe80000, 0xe8ffff, "🇦🇺"],
];

export function icao24ToFlag(icao24: string | null | undefined): string {
  if (!icao24) return "";
  const n = parseInt(icao24, 16);
  if (isNaN(n)) return "";
  for (const [lo, hi, flag] of ICAO24_RANGES) {
    if (n >= lo && n <= hi) return flag;
  }
  return "";
}

export function getFlag(reg: string | null | undefined, icao24: string | null | undefined): string {
  return registrationToFlag(reg) || icao24ToFlag(icao24);
}
