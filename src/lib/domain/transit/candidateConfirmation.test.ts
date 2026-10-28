import { describe, expect, it } from "vitest";
import type { TransitCandidate } from "@/types";
import { confirmedCandidateIds, type CandidateConfirmationState } from "./candidateConfirmation";

function candidate(timestamp = 1000, lat = 45, overrides: Partial<NonNullable<TransitCandidate["prediction"]>> = {}): TransitCandidate {
  return { flight: { id: "a", position: { lat, lng: 16 }, timestamp, groundSpeedMps: 200,
    trackDeg: 90, geoAltitudeMeters: 10000, baroAltitudeMeters: null }, separationDeg: 5,
    elevationGapDeg: 0, isPossibleTransit: false, willTransit: true,
    prediction: { fixTimestampMs: timestamp, lat, lng: 16, alignmentAtMs: 100000, providerId: "localsdr", ...overrides } };
}
function seed() {
  const state: CandidateConfirmationState = new Map();
  expect(confirmedCandidateIds(state, [candidate()], 1000).size).toBe(0);
  return state;
}
describe("candidate evidence shared by client and server", () => {
  it("requires two newer moving fixes and retains confirmation during animation ticks", () => {
    const state = seed();
    const next = candidate(11000, 45.01);
    expect(confirmedCandidateIds(state, [next], 11000).has("a")).toBe(true);
    expect(confirmedCandidateIds(state, [next], 11250).has("a")).toBe(true);
  });
  it("repeated frames and restamped frozen positions do not confirm", () => {
    const state = seed();
    for (let t = 1250; t < 10000; t += 250) {
      expect(confirmedCandidateIds(state, [candidate()], t).size).toBe(0);
    }
    expect(confirmedCandidateIds(state, [candidate(11000)], 11000).size).toBe(0);
  });
  it("a changed position without a newer timestamp is not new evidence", () => {
    expect(confirmedCandidateIds(seed(), [candidate(1000, 45.01)], 11000).size).toBe(0);
  });
  it("source handover starts a new confirmation", () => {
    expect(confirmedCandidateIds(seed(), [candidate(11000, 45.01, {providerId:"avionix"})], 11000).size).toBe(0);
  });
  it("unstable arrival times start a new confirmation", () => {
    expect(confirmedCandidateIds(seed(), [candidate(11000, 45.01, {alignmentAtMs:120001})], 11000).size).toBe(0);
  });
  it("empty snapshots and loss of disk overlap reset evidence", () => {
    for (const lost of [[], [{ ...candidate(), willTransit: false }]]) {
      const state = seed();
      confirmedCandidateIds(state, lost, 5000);
      expect(state.size).toBe(0);
      expect(confirmedCandidateIds(state, [candidate(11000, 45.01)], 11000).size).toBe(0);
    }
  });
  it("does not join fixes across a long outage", () => {
    expect(confirmedCandidateIds(seed(), [candidate(61000, 45.01)], 61000).size).toBe(0);
  });
  it("rejects missing prediction metadata", () => {
    expect(confirmedCandidateIds(seed(), [{...candidate(), prediction:undefined}], 11000).size).toBe(0);
  });
});
