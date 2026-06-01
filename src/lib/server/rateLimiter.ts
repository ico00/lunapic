import { NextResponse } from "next/server";

/**
 * In-memory sliding-window rate limiter za server-side API rute.
 *
 * Radi **samo** na persistentnom Node.js procesu (cPanel / `server.js`).
 * Na serverless okruženjima (Vercel Hobby) memorija se može resetirati između
 * invokacija — tamo je ovo best-effort, ne hard garantirani limit.
 */

type Window = {
  /** Početak trenutnog prozora (ms). */
  windowStart: number;
  /** Broj zahtjeva unutar prozora. */
  count: number;
};

const store = new Map<string, Window>();

/** Periodično čišćenje starih zapisa (svakih 5 min). */
setInterval(
  () => {
    const cutoff = Date.now() - 60_000 * 5;
    for (const [key, w] of store) {
      if (w.windowStart < cutoff) store.delete(key);
    }
  },
  5 * 60_000
).unref(); // Ne drži Node.js proces živim samo zbog ovoga.

/**
 * Provjeri je li IP prekoračio limit.
 *
 * @param ip       - IP adresa pozivatelja
 * @param limit    - maksimalan broj zahtjeva u prozoru (default: 60)
 * @param windowMs - duljina prozora u ms (default: 60 s)
 * @returns `{ allowed: true }` ili `{ allowed: false, retryAfterMs: number }`
 */
export function checkRateLimit(
  ip: string,
  limit = 60,
  windowMs = 60_000
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const existing = store.get(ip);

  if (!existing || now - existing.windowStart >= windowMs) {
    // Novi prozor
    store.set(ip, { windowStart: now, count: 1 });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    const retryAfterMs = windowMs - (now - existing.windowStart);
    return { allowed: false, retryAfterMs };
  }

  existing.count += 1;
  return { allowed: true };
}

/**
 * Izvuci IP iz Next.js `Request` objekta.
 * Podrška za `x-forwarded-for` (nginx reverse proxy ispred Node-a).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

/**
 * Convenience wrapper — vraća NextResponse 429 ako je IP prekoračio limit,
 * ili `null` ako je zahtjev dopušten. Koristiti kao jednu liniju na vrhu handlera.
 *
 * @example
 *   const reject = rejectIfRateLimited(req, 30, 60_000);
 *   if (reject) return reject;
 */
export function rejectIfRateLimited(
  req: Request,
  limit: number,
  windowMs = 60_000
): NextResponse | null {
  const rl = checkRateLimit(getClientIp(req), limit, windowMs);
  if (rl.allowed) return null;
  return NextResponse.json(
    { error: "Previše zahtjeva. Pokušaj ponovo za nekoliko sekundi." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        "Content-Type": "application/json",
      },
    }
  );
}
