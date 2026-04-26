import { create } from "zustand";

type WeatherState = {
  /** Omjer oblačnosti 0–100 % za trenutni referentni plan (promatrač + `referenceEpochMs`), ili null. */
  cloudCoverPercent: number | null;
  isLoading: boolean;
  error: string | null;
  setCloudCover: (percent: number | null) => void;
  setLoading: (v: boolean) => void;
  setError: (message: string | null) => void;
};

export const useWeatherStore = create<WeatherState>((set) => ({
  cloudCoverPercent: null,
  isLoading: false,
  error: null,
  setCloudCover: (percent) => set({ cloudCoverPercent: percent }),
  setLoading: (v) => set({ isLoading: v }),
  setError: (message) => set({ error: message }),
}));
