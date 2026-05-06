"use client";

import { fetchOpenSkyAircraftTypeLabel } from "@/lib/flight/openskyAircraftIndexClient";
import type { FlightState } from "@/types/flight";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useEffect, useRef } from "react";

const DEBOUNCE_MS = 450;
/** OpenSky snapshot može imati stotine letova; indeks je lokalno keširan po shardu. */
const MAX_FLIGHTS = 220;
const CONCURRENCY = 4;

function icaoForIndexLookup(f: FlightState): string | null {
  const fromIcao = f.icao24?.trim();
  const fromId = f.id?.trim();
  const raw = fromIcao || fromId;
  return raw ? raw : null;
}

/**
 * Punjenje `FlightState.aircraftType` iz lokalnog OpenSky indeksa za sve letove
 * koji još nemaju tip — isto kao lazy lookup u {@link SelectedAircraftMapPopup},
 * ali bez čekanja na odabir na karti (Filter / aircraft type multi-select).
 */
export function useFlightAircraftTypeIndexPrefetch(): void {
  const flights = useMoonTransitStore((s) => s.flights);
  const patch = useMoonTransitStore((s) => s.patchFlightAircraftTypeFromIndex);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      runAbortRef.current?.abort();
      const ac = new AbortController();
      runAbortRef.current = ac;

      const need = flights
        .filter((f) => !f.aircraftType?.trim() && icaoForIndexLookup(f))
        .slice(0, MAX_FLIGHTS);

      if (need.length === 0) {
        return;
      }

      void (async () => {
        const queue = [...need];
        const worker = async (): Promise<void> => {
          while (!ac.signal.aborted) {
            const f = queue.shift();
            if (!f) {
              break;
            }
            const icao = icaoForIndexLookup(f);
            if (!icao) {
              continue;
            }
            try {
              const label = await fetchOpenSkyAircraftTypeLabel(icao);
              if (ac.signal.aborted || !label.trim()) {
                continue;
              }
              patch(f.id, label);
            } catch (e) {
              if (!ac.signal.aborted) {
                console.warn(
                  "[MoonTransit] OpenSky aircraft index prefetch failed",
                  e
                );
              }
            }
          }
        };
        const n = Math.min(CONCURRENCY, need.length);
        await Promise.all(Array.from({ length: n }, () => worker()));
      })();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      runAbortRef.current?.abort();
    };
  }, [flights, patch]);
}
