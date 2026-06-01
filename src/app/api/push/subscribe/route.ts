import { NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import {
  readSubs,
  writeSubs,
  type PushSubscriptionRecord,
} from "@/lib/server/pushSubsStore";

export async function POST(req: Request) {
  const reject = rejectIfRateLimited(req, 10, 60_000);
  if (reject) return reject;

  let body: { subscription?: PushSubscriptionRecord };
  try {
    body = (await req.json()) as { subscription?: PushSubscriptionRecord };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "Missing subscription fields" }, { status: 400 });
  }
  const subs = readSubs();
  subs[sub.endpoint] = sub;
  writeSubs(subs);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const reject = rejectIfRateLimited(req, 10, 60_000);
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
