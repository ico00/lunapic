/**
 * Datotečna pohrana Web Push pretplata (`data/push-subscriptions.json`).
 *
 * Dijeli je `api/push/subscribe` (piše/briše) i `api/push/send` (čita + čisti
 * istekle endpointe). Samo Node server kontekst — nikad klijent.
 *
 * NAPOMENA: read-modify-write nije atomičan; kod istovremenih subscribe poziva
 * teoretski je moguć race. Prihvatljivo za osobni deployment s malo uređaja.
 */

import fs from "node:fs";
import path from "node:path";
import type { CameraSensorType } from "@/lib/domain/geometry/shotFeasibility";

/** Promatračeva lokacija spremljena uz pretplatu — server je treba za detekciju. */
export type SubscriptionObserver = {
  lat: number;
  lng: number;
  groundHeightMeters: number;
};

/** Kamera spremljena uz pretplatu — kontrolira FOV/willTransit klasifikaciju. */
export type SubscriptionCamera = {
  focalLengthMm: number;
  sensorType: CameraSensorType;
};

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Opcionalno: legacy pretplate nemaju ovo i preskaču se u server-side scanu. */
  observer?: SubscriptionObserver;
  camera?: SubscriptionCamera;
};

const SUBS_FILE = path.join(process.cwd(), "data", "push-subscriptions.json");

export function readSubs(): Record<string, PushSubscriptionRecord> {
  try {
    const raw = fs.readFileSync(SUBS_FILE, "utf8");
    return JSON.parse(raw) as Record<string, PushSubscriptionRecord>;
  } catch {
    return {};
  }
}

export function writeSubs(subs: Record<string, PushSubscriptionRecord>): void {
  const dir = path.dirname(SUBS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), "utf8");
}
