import type { FlightState } from "@/types/flight";
import {
  flightAircraftTypeDisplayLine,
  flightAirlineDisplayLine,
} from "@/lib/flight/flightDisplayLabels";

export type FlightSearchField = {
  readonly id: string;
  readonly extract: (flight: FlightState) => string | null | undefined;
};

export type FlightSearchMode = "allTerms" | "anyTerm";

export type FlightSearchOptions = {
  readonly fields?: readonly FlightSearchField[];
  readonly mode?: FlightSearchMode;
};

export type FlightFilterCriteria = {
  readonly query: string;
  readonly aircraftTypes: readonly string[];
};

export const DEFAULT_FLIGHT_SEARCH_FIELDS: readonly FlightSearchField[] = [
  { id: "callsign", extract: (f) => f.callSign },
  { id: "airlineDisplay", extract: (f) => flightAirlineDisplayLine(f) },
  { id: "airlineName", extract: (f) => f.airlineName },
  { id: "airlineIcao", extract: (f) => f.airlineIcao },
  { id: "aircraftTypeDisplay", extract: (f) => flightAircraftTypeDisplayLine(f) },
  { id: "aircraftType", extract: (f) => f.aircraftType },
  { id: "icao24", extract: (f) => f.icao24 },
  { id: "originCountry", extract: (f) => f.originCountry },
  { id: "id", extract: (f) => f.id },
] as const;

function normalizeSearchText(input: string): string {
  return input.trim().toLowerCase();
}

function searchTermsFromQuery(query: string): readonly string[] {
  const q = normalizeSearchText(query);
  if (!q) {
    return [];
  }
  return q.split(/\s+/).filter(Boolean);
}

function searchableTextForFlight(
  flight: FlightState,
  fields: readonly FlightSearchField[]
): string {
  return fields
    .map((field) => field.extract(flight))
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

export function matchesFlightSearch(
  flight: FlightState,
  query: string,
  options: FlightSearchOptions = {}
): boolean {
  const terms = searchTermsFromQuery(query);
  if (terms.length === 0) {
    return true;
  }
  const fields = options.fields ?? DEFAULT_FLIGHT_SEARCH_FIELDS;
  const mode = options.mode ?? "allTerms";
  const haystack = searchableTextForFlight(flight, fields);
  if (!haystack) {
    return false;
  }
  if (mode === "anyTerm") {
    return terms.some((term) => haystack.includes(term));
  }
  return terms.every((term) => haystack.includes(term));
}

export function filterFlightsBySearch(
  flights: readonly FlightState[],
  query: string,
  options: FlightSearchOptions = {}
): readonly FlightState[] {
  if (!query.trim()) {
    return flights;
  }
  return flights.filter((flight) => matchesFlightSearch(flight, query, options));
}

export function aircraftTypeForFilter(flight: FlightState): string {
  const label = flightAircraftTypeDisplayLine(flight)?.trim();
  return label && label.length > 0 ? label : "N/A";
}

export function uniqueAircraftTypeFilterOptions(
  flights: readonly FlightState[]
): readonly string[] {
  const set = new Set<string>();
  for (const flight of flights) {
    set.add(aircraftTypeForFilter(flight));
  }
  return [...set].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

export function filterFlightsByCriteria(
  flights: readonly FlightState[],
  criteria: FlightFilterCriteria
): readonly FlightState[] {
  const bySearch = filterFlightsBySearch(flights, criteria.query);
  if (criteria.aircraftTypes.length === 0) {
    return bySearch;
  }
  const typeSet = new Set(criteria.aircraftTypes);
  return bySearch.filter((flight) => typeSet.has(aircraftTypeForFilter(flight)));
}

