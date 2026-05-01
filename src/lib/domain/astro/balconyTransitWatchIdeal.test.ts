import { describe, expect, it } from "vitest";
import {
  BALCONY_TRANSIT_WATCH_REFERENCE,
  isBalconyTransitWatchIdeal,
} from "@/lib/domain/astro/balconyTransitWatchIdeal";
import { DEFAULT_OBSERVER_LOCATION } from "@/lib/defaultObserverLocation";
import type { MoonState } from "@/types/moon";

function moon(partial: Partial<MoonState>): MoonState {
  const base: MoonState = {
    altitudeDeg: BALCONY_TRANSIT_WATCH_REFERENCE.altitudeMidDeg,
    azimuthDeg: BALCONY_TRANSIT_WATCH_REFERENCE.azimuthMidDeg,
    apparentRadius: {
      degrees: BALCONY_TRANSIT_WATCH_REFERENCE.angularRadiusMidDeg,
    },
    illuminationFraction: 1,
    phaseFraction: 0.5,
    distanceKm: 380_000,
  };
  return { ...base, ...partial };
}

describe("isBalconyTransitWatchIdeal", () => {
  it("is true at reference observer with reference moon numbers", () => {
    expect(
      isBalconyTransitWatchIdeal(moon({}), {
        ...DEFAULT_OBSERVER_LOCATION,
      })
    ).toBe(true);
  });

  it("is false when observer is moved away", () => {
    expect(
      isBalconyTransitWatchIdeal(moon({}), {
        lat: DEFAULT_OBSERVER_LOCATION.lat + 0.05,
        lng: DEFAULT_OBSERVER_LOCATION.lng,
        groundHeightMeters: 130,
      })
    ).toBe(false);
  });

  it("is false when altitude is outside the band", () => {
    expect(
      isBalconyTransitWatchIdeal(
        moon({ altitudeDeg: BALCONY_TRANSIT_WATCH_REFERENCE.altitudeMidDeg + 5 }),
        { ...DEFAULT_OBSERVER_LOCATION }
      )
    ).toBe(false);
  });

  it("is false when azimuth is far from reference", () => {
    expect(
      isBalconyTransitWatchIdeal(moon({ azimuthDeg: 20 }), {
        ...DEFAULT_OBSERVER_LOCATION,
      })
    ).toBe(false);
  });

  it("is false when moon is not nearly full", () => {
    expect(
      isBalconyTransitWatchIdeal(moon({ illuminationFraction: 0.5 }), {
        ...DEFAULT_OBSERVER_LOCATION,
      })
    ).toBe(false);
  });
});
