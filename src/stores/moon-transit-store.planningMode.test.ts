import { beforeEach, describe, expect, it } from "vitest";
import { useMoonTransitStore } from "./moon-transit-store";

describe("planning mode (setTimeAnchorPlanned)", () => {
  beforeEach(() => {
    useMoonTransitStore.getState().syncTimeToNow();
  });

  it("postavlja sidro, ref i flag; offset 0", () => {
    const future = Date.now() + 5 * 86_400_000;
    useMoonTransitStore.getState().setTimeAnchorPlanned(future);
    const s = useMoonTransitStore.getState();
    expect(s.timeAnchorMs).toBe(future);
    expect(s.referenceEpochMs).toBe(future);
    expect(s.timeOffsetMs).toBe(0);
    expect(s.timeAnchorIsPlanned).toBe(true);
  });

  it("tickLiveTime NE povlači planirano sidro na now", () => {
    const future = Date.now() + 5 * 86_400_000;
    useMoonTransitStore.getState().setTimeAnchorPlanned(future);
    useMoonTransitStore.getState().tickLiveTime();
    expect(useMoonTransitStore.getState().timeAnchorMs).toBe(future);
    expect(useMoonTransitStore.getState().referenceEpochMs).toBe(future);
  });

  it("slider unutar planiranog dana zadržava planning mode", () => {
    const future = Date.now() + 5 * 86_400_000;
    useMoonTransitStore.getState().setTimeAnchorPlanned(future);
    useMoonTransitStore.getState().setTimeOffsetMs(3 * 3_600_000);
    const s = useMoonTransitStore.getState();
    expect(s.referenceEpochMs).toBe(future + 3 * 3_600_000);
    expect(s.timeAnchorIsPlanned).toBe(true);
  });

  it("syncTimeToNow izlazi iz planning modea", () => {
    useMoonTransitStore.getState().setTimeAnchorPlanned(Date.now() + 86_400_000);
    useMoonTransitStore.getState().syncTimeToNow();
    const s = useMoonTransitStore.getState();
    expect(s.timeAnchorIsPlanned).toBe(false);
    expect(Math.abs(s.timeAnchorMs - Date.now())).toBeLessThan(2_000);
  });

  it("odbija nevaljano sidro", () => {
    const before = useMoonTransitStore.getState().timeAnchorMs;
    useMoonTransitStore.getState().setTimeAnchorPlanned(NaN);
    useMoonTransitStore.getState().setTimeAnchorPlanned(0);
    expect(useMoonTransitStore.getState().timeAnchorMs).toBe(before);
    expect(useMoonTransitStore.getState().timeAnchorIsPlanned).toBe(false);
  });
});
