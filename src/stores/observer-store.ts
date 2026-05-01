import { create } from "zustand";
import { DEFAULT_OBSERVER_LOCATION } from "@/lib/defaultObserverLocation";
import type { GroundObserver } from "@/types/geo";

const DEFAULT_OBSERVER: GroundObserver = DEFAULT_OBSERVER_LOCATION;

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
   * Povećava se kad UI traži `setObserverFromMapView` iz trenutnog centra karte
   * (`useMoonTransitMap` čita `getCenter` i postavlja promatrača).
   */
  placeObserverFromViewNonce: number;
  /**
   * Spriječi slučajne dodire / GPS s pomakom promatrača (teren).
   */
  observerLocationLocked: boolean;
  /**
   * Povećava se kad treba nadopuniti `groundHeightMeters` s Mapbox DEM-om
   * (npr. GPS bez `coords.altitude`) — `useMoonTransitMap` reagira kad je karta spremna.
   */
  terrainGroundHeightSyncNonce: number;
  requestTerrainGroundHeightSync: () => void;
  setObserver: (next: Partial<GroundObserver>) => void;
  /**
   * Postavi samo tlocrt iz centra trenutnog viewporta (ručno poravnanje s kartom).
   */
  setObserverFromMapView: (center: { lat: number; lng: number }) => void;
  /** Traži centriranje karte na promatraču (samo view, ne mijenja koordinate). */
  requestFocusOnObserver: () => void;
  /** Centar trenutnog Mapbox viewa → `observer` (kroz `useMoonTransitMap`). */
  requestPlaceObserverFromView: () => void;
  setObserverLocationLocked: (locked: boolean) => void;
};

export const useObserverStore = create<ObserverState>((set) => ({
  observer: DEFAULT_OBSERVER,
  mapFocusNonce: 0,
  placeObserverFromViewNonce: 0,
  observerLocationLocked: false,
  terrainGroundHeightSyncNonce: 0,
  requestTerrainGroundHeightSync: () =>
    set((s) => ({
      terrainGroundHeightSyncNonce: s.terrainGroundHeightSyncNonce + 1,
    })),
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
  requestPlaceObserverFromView: () =>
    set((s) => ({
      placeObserverFromViewNonce: s.placeObserverFromViewNonce + 1,
    })),
}));
