import { describe, expect, it } from "vitest";
import {
  ALERT_COOLDOWN_MS,
  canAlertActive,
  canAlertCandidate,
  stampActiveAlert,
  stampCandidateAlert,
  type AlertCooldowns,
} from "./alertCooldown";

describe("alert cooldowns", () => {
  const nowMs = 1_000_000;

  it("a candidate alert does not silence the active transit that follows it", () => {
    const stamps: AlertCooldowns = new Map();
    stampCandidateAlert(stamps, "a", nowMs);
    expect(canAlertActive(stamps, "a", nowMs + 45_000)).toBe(true);
  });

  it("an active transit blocks a late candidate alert for the same flight", () => {
    const stamps: AlertCooldowns = new Map();
    stampActiveAlert(stamps, "a", nowMs);
    expect(canAlertCandidate(stamps, "a", nowMs + 45_000)).toBe(false);
  });

  it("each alert kind cools down on its own, per flight", () => {
    const stamps: AlertCooldowns = new Map();
    stampCandidateAlert(stamps, "a", nowMs);
    stampActiveAlert(stamps, "b", nowMs);
    expect(canAlertCandidate(stamps, "a", nowMs + ALERT_COOLDOWN_MS - 1)).toBe(false);
    expect(canAlertCandidate(stamps, "a", nowMs + ALERT_COOLDOWN_MS)).toBe(true);
    expect(canAlertActive(stamps, "b", nowMs + ALERT_COOLDOWN_MS - 1)).toBe(false);
    expect(canAlertActive(stamps, "b", nowMs + ALERT_COOLDOWN_MS)).toBe(true);
    expect(canAlertCandidate(stamps, "c", nowMs)).toBe(true);
  });
});
