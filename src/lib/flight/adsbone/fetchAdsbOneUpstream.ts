import { appPath } from "@/lib/paths/appPath";
import { ADSB_LIVE_POINT_BASES } from "./adsbLiveUpstreamBases";
import type { AdsbOnePointResponse } from "./parseAdsbOnePoint";

function cloudflareBlockedMessage(status: number, bodySnippet: string): string {
  const looksCf =
    status === 403 &&
    /cloudflare|Attention Required/i.test(bodySnippet);
  if (!looksCf) {
    return "";
  }
  return " Upstream blocked this request (often Cloudflare on datacenter IPs). The app tries your browser against multiple mirrors, then the same-origin proxy.";
}

/**
 * Proxy-only by default:
 * 1) `GET /api/adsbone/point` (isti origin, bez CORS šuma u konzoli).
 * 2) Direktni browser fallback na live mirror je isključen osim uz
 *    `NEXT_PUBLIC_ADSBONE_ALLOW_DIRECT=1` (debug / posebni deploymenti).
 */
export async function fetchAdsbOnePointJson(
  lat: number,
  lng: number,
  radiusNm: number
): Promise<AdsbOnePointResponse> {
  const pathSeg = `${lat}/${lng}/${radiusNm}`;
  const disableDirect =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_ADSBONE_DISABLE_DIRECT === "1";
  const allowDirect =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_ADSBONE_ALLOW_DIRECT === "1";
  const proxyUrl = appPath(
    `/api/adsbone/point?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&radiusNm=${encodeURIComponent(String(radiusNm))}`
  );
  try {
    return await fetchViaProxy(proxyUrl);
  } catch (proxyError) {
    const shouldTryDirect =
      typeof window !== "undefined" && !disableDirect && allowDirect;
    if (!shouldTryDirect) {
      throw proxyError;
    }
  }

  for (const base of ADSB_LIVE_POINT_BASES) {
    try {
      const r = await fetch(`${base}/${pathSeg}`, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (r.ok) {
        return (await r.json()) as AdsbOnePointResponse;
      }
    } catch {
      /* CORS / mreža — sljedeći mirror */
    }
  }

  return await fetchViaProxy(proxyUrl);
}

async function fetchViaProxy(url: string): Promise<AdsbOnePointResponse> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 240);
    try {
      const j = JSON.parse(text) as {
        error?: string;
        body?: string;
        hint?: string;
      };
      const parts: string[] = [];
      for (const x of [j.error, j.body, j.hint]) {
        if (typeof x === "string" && x.length > 0 && !parts.includes(x)) {
          parts.push(x);
        }
      }
      if (parts.length > 0) {
        message = parts.join(" — ");
      }
    } catch {
      /* non-JSON */
    }
    message += cloudflareBlockedMessage(res.status, text);
    throw new Error(`ADS-B One: ${res.status} ${message}`);
  }
  return JSON.parse(text) as AdsbOnePointResponse;
}
