import type { GroundObserver } from "@/types/geo";
import { create } from "zustand";

const DEFAULT_OBSERVER: GroundObserver = {
  lat: 45.81,
  lng: 15.98,
  groundHeightMeters: 0,
};

type ObserverState = {
  /**
   * Fiksna točka s koje gleda ephemeris i geometrija; ne slijedi središte karte.
   */
  observer: GroundObserver;
  /**
   * Povećava se na svaki zahtjev za fokusom — MapContainer reagira s flyTo.
   */
  mapFocusNonce: number;
  /**
   * Spriječi slučajne dodire / GPS s pomakom promatrača (teren).
   */
  observerLocationLocked: boolean;
  setObserver: (next: Partial<GroundObserver>) => void;
  /**
   * Postavi samo tlocrt iz centra trenutnog viewporta (ručno poravnanje s kartom).
   */
  setObserverFromMapView: (center: { lat: number; lng: number }) => void;
  /** Traži centriranje karte na promatraču (samo view, ne mijenja koordinate). */
  requestFocusOnObserver: () => void;
  setObserverLocationLocked: (locked: boolean) => void;
};

export const useObserverStore = create<ObserverState>((set) => ({
  observer: DEFAULT_OBSERVER,
  mapFocusNonce: 0,
  observerLocationLocked: false,
  setObserver: (next) =>
    set((s) => {
      if (s.observerLocationLocked) {
        return s;
      }
      return { observer: { ...s.observer, ...next } };
    }),
  setObserverFromMapView: ({ lat, lng }) =>
    set((s) => {
      if (s.observerLocationLocked) {
        return s;
      }
      return {
        observer: { ...s.observer, lat, lng },
      };
    }),
  setObserverLocationLocked: (locked) => set({ observerLocationLocked: locked }),
  requestFocusOnObserver: () =>
    set((s) => ({ mapFocusNonce: s.mapFocusNonce + 1 })),
}));
