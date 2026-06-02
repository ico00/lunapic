/**
 * Shared Web Push sender — jedini izvor VAPID konfiguracije i 410/404 expiry
 * cleanupa. Dijele ga `api/push/send` (broadcast) i `api/transit/scan`
 * (server-side detekcija). Samo Node server kontekst.
 */

import webpush from "web-push";
import {
  readSubs,
  writeSubs,
  type PushSubscriptionRecord,
} from "./pushSubsStore";

let configured = false;

/** Jesu li VAPID ključevi prisutni u env-u. */
export function isVapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PRIVATE_KEY &&
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_SUBJECT
  );
}

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!isVapidConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  tag: string;
  urgent: boolean;
};

/**
 * Pošalji `payload` zadanim pretplatama. Istekle (HTTP 410/404) endpointe
 * uklanja iz trajne pohrane. Vraća broj uspješno poslanih.
 */
export async function sendToSubscriptions(
  records: readonly PushSubscriptionRecord[],
  payload: PushPayload
): Promise<{ sent: number; expired: number }> {
  if (!ensureConfigured() || records.length === 0) {
    return { sent: 0, expired: 0 };
  }

  const body = JSON.stringify(payload);
  const expired: string[] = [];
  let sent = 0;

  await Promise.allSettled(
    records.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          expired.push(sub.endpoint);
        }
      }
    })
  );

  if (expired.length > 0) {
    const updated = readSubs();
    for (const ep of expired) delete updated[ep];
    writeSubs(updated);
  }

  return { sent, expired: expired.length };
}
