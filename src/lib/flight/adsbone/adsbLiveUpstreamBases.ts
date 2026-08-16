/**
 * ADSBExchange v2-compatible `/v2/point/{lat}/{lon}/{radius}` bases.
 *
 * Trenutno **adsb.lol** — otvorena zajednička mreža, bez ključa, isti JSON
 * oblik (`{ ac: [...] }`) koji čita `parseAdsbOnePoint`.
 *
 * Povijest (2026-08-16): ranije su ovdje bili `api.adsb.one` i
 * `api.airplanes.live`. To **nisu bila dva operatora** nego jedan isti servis
 * pod dva imena (adsb.one je stari naziv Airplanes.live-a; njihov API repo
 * `airplanes-live/api-archive` dokumentira `api.adsb.one`), pa lista nikad nije
 * bila prava redundancija. Oba su prestala raditi: adsb.one vraća Cloudflare
 * 403 i na korijenu (repo arhiviran 2026-04-29), a airplanes.live vraća 403 s
 * porukom da se pristup traži mailom — gate uveden bez izmjene njihove
 * dokumentacije (Wayback snapshot od 2026-07-25 još tvrdi da je pristup
 * otvoren).
 *
 * Ako ikad zatreba drugi izvor u listi, uzmi operatora koji **nije** povezan s
 * postojećim (npr. `opendata.adsb.fi`, ali on ima drugu putanju i ključ
 * `aircraft` umjesto `ac`, pa traži adapter u `parseAdsbOnePoint`).
 */
export const ADSB_LIVE_POINT_BASES: readonly string[] = [
  "https://api.adsb.lol/v2/point",
];
