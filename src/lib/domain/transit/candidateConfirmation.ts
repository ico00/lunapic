import type { TransitCandidate } from "@/types";
import { STALE_FIX_AFTER_SEC } from "@/lib/flight/flightFixFreshness";

/** Same evidence requirements for visible-tab alerts and server Web Push. */
export const CANDIDATE_CONFIRMATION_FIXES = 2;
export const MAX_CONFIRMED_ALIGNMENT_DRIFT_MS = 10_000;
const MAX_EVIDENCE_GAP_MS = STALE_FIX_AFTER_SEC * 1000;
type Evidence = NonNullable<TransitCandidate["prediction"]>;
type Entry = { evidence: Evidence; count: number; seenAtMs: number };
export type CandidateConfirmationState = Map<string, Entry>;

/** Missing/negative predictions, source changes and expired evidence restart confirmation.
 * Timestamp alone is insufficient: some receivers restamp an unchanged position.
 */
export function confirmedCandidateIds(
  state: CandidateConfirmationState,
  candidates: readonly TransitCandidate[],
  nowMs: number
): Set<string> {
  const live = new Set<string>();
  const confirmed = new Set<string>();
  for (const c of candidates) {
    const e = c.prediction;
    if (!c.willTransit || !e || ![e.alignmentAtMs, e.fixTimestampMs, e.lat, e.lng].every(Number.isFinite)) continue;
    const id = c.flight.id;
    live.add(id);
    const prev = state.get(id);
    const compatible = prev && prev.evidence.providerId === e.providerId &&
      nowMs - prev.seenAtMs <= MAX_EVIDENCE_GAP_MS &&
      Math.abs(e.alignmentAtMs - prev.evidence.alignmentAtMs) <= MAX_CONFIRMED_ALIGNMENT_DRIFT_MS &&
      e.fixTimestampMs >= prev.evidence.fixTimestampMs;
    let entry: Entry;
    if (!compatible) {
      entry = { evidence: e, count: 1, seenAtMs: nowMs };
    } else if (e.fixTimestampMs > prev.evidence.fixTimestampMs &&
      (e.lat !== prev.evidence.lat || e.lng !== prev.evidence.lng)) {
      entry = { evidence: e, count: Math.min(CANDIDATE_CONFIRMATION_FIXES, prev.count + 1), seenAtMs: nowMs };
    } else {
      // Do not refresh the evidence clock from repeated polls/render ticks.
      entry = prev;
    }
    state.set(id, entry);
    if (entry.count >= CANDIDATE_CONFIRMATION_FIXES) confirmed.add(id);
  }
  for (const id of state.keys()) if (!live.has(id)) state.delete(id);
  return confirmed;
}
