import { NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/server/rateLimiter";
import { readSubs } from "@/lib/server/pushSubsStore";
import { isVapidConfigured, sendToSubscriptions } from "@/lib/server/webPush";

type SendBody = {
  title: string;
  body: string;
  tag?: string;
  urgent?: boolean;
};

/** Allowed origins for push/send — only the app itself may call this endpoint. */
const ALLOWED_ORIGINS = new Set(
  [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, ""),
    // Localhost variants for local dev
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean)
);

/**
 * Endpoint je fan-out broadcast (šalje svim pretplatnicima), pa mora doći iz
 * same-origin browser konteksta. Browser šalje `Origin` na cross-site fetch POST;
 * ako reverse proxy (npr. Tailscale Funnel) skine `Origin`, padamo na `Referer`.
 * Zahtjev BEZ ijednog od ta dva se odbija — time se zatvara trivijalni `curl` bypass
 * (prije je nedostatak Origina prolazio provjeru).
 */
function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) return ALLOWED_ORIGINS.has(origin);
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return ALLOWED_ORIGINS.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

const MAX_TITLE_LEN = 80;
const MAX_BODY_LEN = 200;
const MAX_TAG_LEN = 48;
/** Tag se koristi samo za grupiranje notifikacija; klijent šalje npr. `transit-active-<id>`. */
const TAG_PATTERN = /^[a-z0-9-]{1,48}$/;
const DEFAULT_TAG = "lunapic-transit";

function sanitizeTag(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_TAG;
  const t = raw.trim().slice(0, MAX_TAG_LEN);
  return TAG_PATTERN.test(t) ? t : DEFAULT_TAG;
}

export async function POST(req: Request) {
  // Broadcast je skup (pogađa svaki uređaj), pa držimo limit nisko: 5 / min / IP.
  const reject = rejectIfRateLimited(req, 5, 60_000);
  if (reject) return reject;

  // Only allow calls originating from the app itself (prevents external abuse)
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isVapidConfigured()) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 503 });
  }
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Sanitiziraj i ograniči payload — sadržaj ide na zaključane ekrane svih
  // pretplatnika, pa ne dopuštamo proizvoljno dugačak ili nestring tekst.
  const title = (typeof body.title === "string" ? body.title : "")
    .trim()
    .slice(0, MAX_TITLE_LEN);
  const text = (typeof body.body === "string" ? body.body : "")
    .trim()
    .slice(0, MAX_BODY_LEN);
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const { sent } = await sendToSubscriptions(Object.values(readSubs()), {
    title,
    body: text,
    tag: sanitizeTag(body.tag),
    urgent: body.urgent === true,
  });

  return NextResponse.json({ sent });
}
