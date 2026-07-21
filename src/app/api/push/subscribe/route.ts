import { NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import {
  readSubs,
  writeSubs,
  type PushSubscriptionRecord,
  type SubscriptionCamera,
  type SubscriptionObserver,
} from "@/lib/server/pushSubsStore";
import {
  CAMERA_SENSOR_CROP,
  type CameraSensorType,
} from "@/lib/domain/geometry/shotFeasibility";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Validira/clamp-a lokaciju iz klijenta; vraća null ako je neispravna. */
function parseObserver(raw: unknown): SubscriptionObserver | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const { lat, lng, groundHeightMeters } = o;
  if (
    typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lng !== "number" || !Number.isFinite(lng)
  ) {
    return undefined;
  }
  const gh = typeof groundHeightMeters === "number" && Number.isFinite(groundHeightMeters)
    ? groundHeightMeters
    : 0;
  return {
    lat: clamp(lat, -90, 90),
    lng: clamp(lng, -180, 180),
    groundHeightMeters: clamp(gh, -500, 100_000),
  };
}

/** Validira/clamp-a kameru iz klijenta; vraća null ako je neispravna. */
function parseCamera(raw: unknown): SubscriptionCamera | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const c = raw as Record<string, unknown>;
  const focal = c.focalLengthMm;
  const sensor = c.sensorType;
  if (typeof focal !== "number" || !Number.isFinite(focal)) return undefined;
  if (typeof sensor !== "string" || !(sensor in CAMERA_SENSOR_CROP)) return undefined;
  return {
    focalLengthMm: clamp(Math.round(focal), 50, 2400),
    sensorType: sensor as CameraSensorType,
  };
}

type SubscribeBody = {
  subscription?: PushSubscriptionRecord;
  observer?: unknown;
  camera?: unknown;
};

export async function POST(req: Request) {
  const reject = rejectIfRateLimited(req, 10, 60_000, "push/subscribe");
  if (reject) return reject;

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "Missing subscription fields" }, { status: 400 });
  }
  const observer = parseObserver(body.observer);
  const camera = parseCamera(body.camera);
  const subs = readSubs();
  subs[sub.endpoint] = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    // Zadrži prethodnu lokaciju/kameru ako ovaj zahtjev ne nosi novu (npr. legacy klijent).
    observer: observer ?? subs[sub.endpoint]?.observer,
    camera: camera ?? subs[sub.endpoint]?.camera,
  };
  writeSubs(subs);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const reject = rejectIfRateLimited(req, 10, 60_000, "push/subscribe");
  if (reject) return reject;

  let body: { endpoint?: string };
  try {
    body = (await req.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  const subs = readSubs();
  delete subs[body.endpoint];
  writeSubs(subs);
  return NextResponse.json({ ok: true });
}
