import { AstroService } from "@/lib/domain/astro/astroService";
import { CRITICAL_BELOW_DEG } from "@/lib/domain/astro/moonFieldVisibilityAdvice";
import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import { verticalFovDeg } from "@/lib/domain/geometry/shotFeasibility";
import { screenTransitCandidates } from "@/lib/domain/transit/screening";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useMemo } from "react";

/**
 * Practical photography limit: only flights within this slant range
 * (at the predicted alignment position) are classified as willTransit.
 * Matches the 100 km radius shown on the map.
 */
const MAX_TRANSIT_SLANT_METERS = 100_000;

/**
 * Domena: trenutni Mjesec + zrakoplovi u storeu → kandidati za tranzit
 * i "in frame" kandidati, enrichani s photographerPack podacima.
 *
 * Gornja granica elevation gapa = pola vertikalnog FOV-a odabrane kamere:
 * sve što stane u kadar je relevantno, bez obzira prolazi li disk ili ne.
 */
export function useTransitCandidates() {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  const openSkyLatencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const flights = useMoonTransitStore((s) => s.flights);
  const focalLengthMm = useMoonTransitStore((s) => s.cameraFocalLengthMm);
  const sensorType = useMoonTransitStore((s) => s.cameraSensorType);
  return useMemo(() => {
    const wallNowMs = Date.now();
    const at = new Date(referenceEpochMs);
    const moon = AstroService.getMoonState(at, observer.lat, observer.lng, observer.groundHeightMeters);
    // Below CRITICAL_BELOW_DEG (5°) the moon is likely blocked by buildings/terrain —
    // same threshold shown as "Critical / Hidden" in MoonEphemerisPanel.
    if (moon.altitudeDeg < CRITICAL_BELOW_DEG) {
      return [];
    }
    // Pola vertikalnog FOV-a: ako je elevation gap unutar ove granice, oboje stanu u kadar.
    const halfFovDeg = verticalFovDeg(focalLengthMm, sensorType) / 2;
    const screened = screenTransitCandidates(observer, moon, flights, wallNowMs, openSkyLatencySkewMs);
    const enriched: (typeof screened[number] & { elevationGapDeg: number | null; willTransit: boolean })[] = [];
    for (const c of screened) {
      const pack = GeometryEngine.photographerPack(observer, c.flight, moon, at, {});
      // Nema predviđenog azimutalnog alignmenta → avion nema šanse biti u kadru s Mjesecom.
      if (pack !== null && pack.timeToAlignmentSec === null) {
        continue;
      }
      const gap = pack?.elevationGapAtAlignmentDeg ?? null;
      // Izvan kadra odabrane kamere → nije relevantno.
      if (gap !== null && Math.abs(gap) > halfFovDeg) {
        continue;
      }
      // Transit (alignment) predicted outside photographable range → exclude entirely.
      // A plane 200+ km away at alignment time cannot be photographed regardless of
      // whether it crosses the moon disc or sits within the FOV angle.
      if (pack?.futureSlantMeters != null && pack.futureSlantMeters > MAX_TRANSIT_SLANT_METERS) {
        continue;
      }
      enriched.push({
        ...c,
        elevationGapDeg: gap,
        willTransit: pack?.willActuallyTransit ?? false,
      });
    }
    return enriched;
  }, [observer, referenceEpochMs, openSkyLatencySkewMs, flights, focalLengthMm, sensorType]);
}

export function useMoonStateComputed() {
  const observer = useObserverStore((s) => s.observer);
  const referenceEpochMs = useMoonTransitStore((s) => s.referenceEpochMs);
  return useMemo(
    () =>
      AstroService.getMoonState(
        // Fallback na Date.now() ako store još nije sinkroniziran (inicijalna vrijednost je 0)
        new Date(referenceEpochMs > 0 ? referenceEpochMs : Date.now()),
        observer.lat,
        observer.lng,
        observer.groundHeightMeters
      ),
    [observer, referenceEpochMs]
  );
}
