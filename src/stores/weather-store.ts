import { create } from "zustand";
import type { AtmosphericLevel } from "@/lib/domain/contrail/contrailService";

type WeatherState = {
  /** Omjer oblačnosti 0–100 % za trenutni referentni plan (promatrač + `referenceEpochMs`), ili null. */
  cloudCoverPercent: number | null;
  /** Temperatura i vlažnost po tlačnim razinama (300, 250, 200 hPa) za contrail predikciju. */
  atmosphericLevels: AtmosphericLevel[] | null;
  isLoading: boolean;
  error: string | null;
  setCloudCover: (percent: number | null) => void;
  setAtmosphericLevels: (levels: AtmosphericLevel[] | null) => void;
  setLoading: (v: boolean) => void;
  setError: (message: string | null) => void;
};

export const useWeatherStore = create<WeatherState>((set) => ({
  cloudCoverPercent: null,
  atmosphericLevels: null,
  isLoading: false,
  error: null,
  setCloudCover: (percent) => set({ cloudCoverPercent: percent }),
  setAtmosphericLevels: (levels) => set({ atmosphericLevels: levels }),
  setLoading: (v) => set({ isLoading: v }),
  setError: (message) => set({ error: message }),
}));
