import { NextResponse } from "next/server";
import { readSubs } from "@/lib/server/pushSubsStore";
import { isVapidConfigured, sendToSubscriptions } from "@/lib/server/webPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Obavijest da je prijemnik utihnuo ili se vratio. Okida je `server.js`
 * (`receiverWatchdog.cjs`) i ide svim pretplatama, bez obzira na lokaciju: kad
 * Pi šuti, nitko ne dobiva alerte. Interna ruta, isti token kao `transit/scan`.
 */
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

  let status: unknown;
  let silentMinutes: unknown;
  try {
    ({ status, silentMinutes } = (await req.json()) as {
      status?: unknown;
      silentMinutes?: unknown;
    });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    (status !== "offline" && status !== "online") ||
    typeof silentMinutes !== "number" ||
    !Number.isFinite(silentMinutes)
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Isti `tag`: povratak zamijeni obavijest o padu umjesto da se gomilaju.
  const payload =
    status === "offline"
      ? {
          title: "LunaPic — receiver offline",
          body: `No ADS-B data from the Pi for ${silentMinutes} min. Transit alerts are paused until it is back.`,
          tag: "lunapic-receiver-status",
          urgent: false,
        }
      : {
          title: "LunaPic — receiver back online",
          body: `ADS-B data is flowing again after ${silentMinutes} min. Transit alerts are back on.`,
          tag: "lunapic-receiver-status",
          urgent: false,
        };

  const { sent } = await sendToSubscriptions(Object.values(readSubs()), payload);
  return NextResponse.json({ sent });
}
