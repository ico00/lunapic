/**
 * Cooldown alerta po letu — dijele ga `useCandidateAlerts` (klijent) i
 * `/api/transit/scan` (server).
 *
 * Active i candidate imaju odvojene ključeve, ali asimetrično: najava ne smije
 * utišati stvarni tranzit koji slijedi unutar cooldowna (inače ga `lastActiveIds`
 * zauvijek preskoči), dok nakon stvarnog tranzita najava više nema smisla.
 */
export const ALERT_COOLDOWN_MS = 2 * 60 * 1000;

export type AlertCooldowns = Map<string, number>;

const activeKey = (id: string) => `active:${id}`;
const candidateKey = (id: string) => `candidate:${id}`;

function isCooled(stamps: AlertCooldowns, key: string, nowMs: number): boolean {
  return nowMs - (stamps.get(key) ?? 0) >= ALERT_COOLDOWN_MS;
}

export function canAlertActive(stamps: AlertCooldowns, id: string, nowMs: number): boolean {
  return isCooled(stamps, activeKey(id), nowMs);
}

export function canAlertCandidate(stamps: AlertCooldowns, id: string, nowMs: number): boolean {
  return isCooled(stamps, activeKey(id), nowMs) && isCooled(stamps, candidateKey(id), nowMs);
}

export function stampActiveAlert(stamps: AlertCooldowns, id: string, nowMs: number): void {
  stamps.set(activeKey(id), nowMs);
}

export function stampCandidateAlert(stamps: AlertCooldowns, id: string, nowMs: number): void {
  stamps.set(candidateKey(id), nowMs);
}
