import type { Map } from "mapbox-gl";
import { useEffect, type RefObject } from "react";

const MOBILE_HEADER_PX = 56;

/**
 * Telefon: ploča pokriva donji dio karte, pa se sredina karte podiže iznad nje
 * i promatrač ne ostaje ispod ploče (spec §2b.7). Padding, a ne pomak canvasa:
 * `flyTo` na promatrača i "Set my location here" tako poštuju vidljivi dio.
 */
export function useMapBottomInset(
  mapRef: RefObject<Map | null>,
  mapReadyTick: number,
  bottomInsetPx: number
): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapReadyTick === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({
      padding: {
        top: bottomInsetPx > 0 ? MOBILE_HEADER_PX : 0,
        bottom: bottomInsetPx,
        left: 0,
        right: 0,
      },
      duration: reduced ? 0 : 300,
    });
  }, [mapRef, mapReadyTick, bottomInsetPx]);
}
