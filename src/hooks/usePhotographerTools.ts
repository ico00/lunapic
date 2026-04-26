import { GeometryEngine } from "@/lib/domain/geometry/geometryEngine";
import { extrapolateFlightForDisplay } from "@/lib/flight/extrapolateFlightPosition";
import { useMoonStateComputed } from "@/hooks/useTransitCandidates";
import { useMoonTransitStore } from "@/stores/moon-transit-store";
import { useObserverStore } from "@/stores/observer-store";
import { useEffect, useMemo, useRef, useState } from "react";

export function formatCountdown(totalSec: number | null): string {
  if (totalSec == null || !Number.isFinite(totalSec)) {
    return "—";
  }
  if (totalSec < 0) {
    return "0.0";
  }
  if (totalSec >= 99 * 60) {
    return "—";
  }
  const t = totalSec;
  if (t >= 60) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
  }
  return `${t.toFixed(1)} s`;
}

export function usePhotographerTools() {
  const observer = useObserverStore((s) => s.observer);
  const selectedId = useMoonTransitStore((s) => s.selectedFlightId);
  const flights = useMoonTransitStore((s) => s.flights);
  const refEpoch = useMoonTransitStore((s) => s.referenceEpochMs);
  const latencySkewMs = useMoonTransitStore((s) => s.openSkyLatencySkewMs);
  const moon = useMoonStateComputed();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => {
      clearInterval(id);
    };
  }, []);

  const at = useMemo(
    () => new Date(refEpoch),
    [refEpoch]
  );

  const pack = useMemo(() => {
    if (!selectedId) {
      return null;
    }
    const raw = flights.find((x) => x.id === selectedId) ?? null;
    if (!raw) {
      return null;
    }
    const flight = extrapolateFlightForDisplay(raw, now, latencySkewMs);
    return GeometryEngine.photographerPack(observer, flight, moon, at, {});
  }, [at, flights, latencySkewMs, moon, now, observer, selectedId]);
  return { pack, now };
}

function playBeep(frequency: number) {
  if (globalThis.window === undefined) {
    return;
  }
  const AC =
    (globalThis.window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ?? globalThis.window.AudioContext;
  if (AC == null) {
    return;
  }
  const ctx = new AC();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(frequency, ctx.currentTime);
  g.gain.setValueAtTime(0.1, ctx.currentTime);
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.09);
}

/**
 * 3 s prije točke poravnanja i točno u trenutku (kada |t| mali nakon 0).
 */
export function useTransitBeep(
  timeToAlignmentSec: number | null,
  beepOn: boolean
) {
  const preRef = useRef(false);
  const hitRef = useRef(false);
  const lastSel = useRef<string | null | undefined>(undefined);
  const selectedId = useMoonTransitStore((s) => s.selectedFlightId);
  useEffect(() => {
    if (lastSel.current === undefined) {
      lastSel.current = selectedId;
      return;
    }
    if (lastSel.current !== selectedId) {
      preRef.current = false;
      hitRef.current = false;
      lastSel.current = selectedId;
    }
  }, [selectedId]);
  useEffect(() => {
    if (!beepOn) {
      return;
    }
    if (timeToAlignmentSec == null || !Number.isFinite(timeToAlignmentSec)) {
      return;
    }
    const t = timeToAlignmentSec;
    if (t < 0.1 && t > -0.25 && !hitRef.current) {
      playBeep(990);
      hitRef.current = true;
      return;
    }
    if (t > 0 && t <= 3.2 && t >= 2.6 && !preRef.current) {
      playBeep(660);
      preRef.current = true;
    }
  }, [beepOn, timeToAlignmentSec]);
}
