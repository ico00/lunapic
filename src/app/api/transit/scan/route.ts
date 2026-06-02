import { NextResponse } from "next/server";
import { computeActiveTransits } from "@/lib/domain/transit/computeActiveTransits";
import { computeTransitCandidates } from "@/lib/domain/transit/computeTransitCandidates";
import {
  readSubs,
  type PushSubscriptionRecord,
  type SubscriptionCamera,
} from "@/lib/server/pushSubsStore";
import { isVapidConfigured, sendToSubscriptions } from "@/lib/server/webPush";
import type { CameraSensorType } from "@/lib/domain/geometry/shotFeasibility";
import type { FlightState } from "@/types/flight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side transit scan. Okida ga `server.js` flight-logger poller na svakom
 * ticku (interna ruta, ne browser endpoint). Za svaku pretplatu s lokacijom
 * računa kandidate/aktivne tranzite **istom** logikom kao klijent i šalje Web
 * Push izravno — neovisno o tome je li ijedan tab otvoren.
 */

const COOLDOWN_MS = 2 * 60 * 1000;
const DEFAULT_CAMERA: SubscriptionCamera = {
  focalLengthMm: 600,
  sensorType: "fullFrame",
};

type EndpointState = {
  lastCandidateIds: Set<string>;
  lastActiveIds: Set<string>;
  stamps: Map<string, number>;
};

/** Per-endpoint dedup/cooldown — mirror klijentskih refova u useCandidateAlerts. */
const stateByEndpoint = new Map<string, EndpointState>();

function getState(endpoint: string): EndpointState {
  let s = stateByEndpoint.get(endpoint);
  if (!s) {
    s = { lastCandidateIds: new Set(), lastActiveIds: new Set(), stamps: new Map() };
    stateByEndpoint.set(endpoint, s);
  }
  return s;
}

/** Ukloni dedup stanje za endpointe kojih više nema (otpisane pretplate). */
function pruneState(activeEndpoints: Set<string>): void {
  for (const ep of stateByEndpoint.keys()) {
    if (!activeEndpoints.has(ep)) stateByEndpoint.delete(ep);
  }
}

function sanitizeTag(raw: string): string {
  const t = raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
  return t || "lunapic-transit";
}

function cameraFor(sub: PushSubscriptionRecord): {
  focalLengthMm: number;
  sensorType: CameraSensorType;
} {
  return sub.camera ?? DEFAULT_CAMERA;
}

export async function POST(req: Request) {
  if (
    !process.env.INTERNAL_SCAN_TOKEN ||
    req.headers.get("x-internal-token") !== process.env.INTERNAL_SCAN_TOKEN
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isVapidConfigured()) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 503 });
  }

  let flights: FlightState[];
  try {
    const parsed = (await req.json()) as { flights?: FlightState[] };
    flights = Array.isArray(parsed.flights) ? parsed.flights : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subs = readSubs();
  const endpoints = Object.keys(subs);
  pruneState(new Set(endpoints));
  if (endpoints.length === 0 || flights.length === 0) {
    return NextResponse.json({ scanned: endpoints.length, sent: 0 });
  }

  const nowMs = Date.now();
  const at = new Date(nowMs);
  let sent = 0;

  for (const ep of endpoints) {
    const sub = subs[ep];
    if (!sub.observer) continue; // legacy pretplata bez lokacije — preskoči

    const { focalLengthMm, sensorType } = cameraFor(sub);
    const observer = {
      lat: sub.observer.lat,
      lng: sub.observer.lng,
      groundHeightMeters: sub.observer.groundHeightMeters,
    };

    const candidates = computeTransitCandidates({
      observer,
      focalLengthMm,
      sensorType,
      flights,
      at,
      wallNowMs: nowMs,
      latencySkewMs: 0, // localsdr je live; nema OpenSky latency skewa
    });
    const actives = computeActiveTransits({
      observer,
      flights,
      at,
      wallNowMs: nowMs,
      latencySkewMs: 0,
    });

    const st = getState(ep);
    const isCooled = (id: string) =>
      nowMs - (st.stamps.get(id) ?? 0) >= COOLDOWN_MS;
    const stamp = (id: string) => st.stamps.set(id, nowMs);

    const currentCandidateIds = new Set(
      candidates.filter((c) => c.willTransit).map((c) => c.flight.id)
    );
    const currentActiveIds = new Set(actives.map((r) => r.flight.id));

    type Msg = { title: string; body: string; tag: string; urgent: boolean };
    const messages: Msg[] = [];

    // --- Active transits (priority) ---
    for (const row of actives) {
      const id = row.flight.id;
      if (st.lastActiveIds.has(id) || !isCooled(id)) continue;
      const callsign = row.flight.callSign?.trim() || id;
      stamp(id);
      messages.push({
        title: "LunaPic — active transit!",
        body: `${callsign} is crossing the moon now (${row.separationDeg.toFixed(2)}°)`,
        tag: sanitizeTag(`transit-active-${id}`),
        urgent: true,
      });
    }

    // --- New disc-transit candidates ---
    for (const c of candidates.filter((c) => c.willTransit)) {
      const id = c.flight.id;
      if (st.lastCandidateIds.has(id) || currentActiveIds.has(id) || !isCooled(id)) {
        continue;
      }
      const callsign = c.flight.callSign?.trim() || id;
      stamp(id);
      messages.push({
        title: "LunaPic — transit candidate",
        body: `${callsign} approaching moon (${c.separationDeg.toFixed(2)}°)`,
        tag: sanitizeTag(`transit-candidate-${id}`),
        urgent: false,
      });
    }

    st.lastCandidateIds = currentCandidateIds;
    st.lastActiveIds = currentActiveIds;

    for (const m of messages) {
      const res = await sendToSubscriptions([sub], m);
      sent += res.sent;
    }
  }

  return NextResponse.json({ scanned: endpoints.length, sent });
}
