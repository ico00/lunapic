import { ABOUT_LANG_COOKIE, readAboutLangCookie, type AboutLang } from "./aboutLang";

export type AboutStoryContext = {
  root: HTMLElement;
  /** Prekida sve slušače stranice pri izlasku. */
  signal: AbortSignal;
  t: (hr: string, en: string) => string;
  onLangChange: (fn: () => void) => () => void;
};

const ARIA_LABELS: [selector: string, attribute: string, hr: string, en: string][] = [
  ["nav.chapters", "aria-label", "Poglavlja", "Chapters"],
  [
    "#hero3d",
    "aria-label",
    "3D prikaz: avion šalje radio valove, vlastita stanica ih hvata, podaci putuju na LunaPic server i dalje na mobitel",
    "3D view: an aircraft sends radio waves, the own station catches them, data travels to the LunaPic server and on to the phone",
  ],
  ["#fields", "aria-label", "Dijelovi poruke", "Parts of the message"],
  [
    "#antena svg",
    "aria-label",
    "Zgrada s antenom; unutra Raspberry Pi; podaci idu preko interneta na LunaPic server",
    "A building with an antenna; inside, a Raspberry Pi; data goes over the internet to the LunaPic server",
  ],
  [
    "#rute svg",
    "aria-label",
    "Više tankih linija pojedinačnih preleta; gdje se preklapaju, nastaje koridor",
    "Many thin lines of individual passes; where they overlap, a corridor forms",
  ],
  [
    "#map3d",
    "aria-label",
    "3D prikaz karte: promatrač, linija pogleda prema Mjesecu, zelena zona, krug od 80 km i avioni po visini; zeleni avion prolazi kroz liniju pogleda",
    "3D map: observer, line of sight to the Moon, green zone, 80 km circle and aircraft by altitude; the green aircraft crosses the line of sight",
  ],
  ["#map3d .ctrls", "aria-label", "Pogled", "View"],
];

const MESSAGE_HEX = "8D4840D6202CC371C32CE0576098";
const MESSAGE_CHARSET = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ##### ###############0123456789######";
const MESSAGE_FIELDS: {
  name: string;
  nameEn: string;
  from: number;
  len: number;
  c: string;
  big: string;
  bigEn?: string;
  text: string;
  textEn: string;
  chars?: boolean;
}[] = [
  {
    name: "Vrsta poruke",
    nameEn: "Message type",
    from: 0,
    len: 5,
    c: "#a78bfa",
    big: "10001 → 17",
    text: "Broj 17 znači da je ovo ADS-B poruka. Postoje i druge vrste poruka koje transponder šalje kad ga radar pita.",
    textEn:
      "17 means this is an ADS-B message. The transponder also sends other kinds of messages when a radar interrogates it.",
  },
  {
    name: "Sposobnost",
    nameEn: "Capability",
    from: 5,
    len: 3,
    c: "#94a3b8",
    big: "101 → 5",
    text: "Kratka oznaka o vrsti transpondera u avionu. Za praćenje nije važna.",
    textEn: "A short code for the type of transponder on board. Not important for tracking.",
  },
  {
    name: "Adresa aviona",
    nameEn: "Aircraft address",
    from: 8,
    len: 24,
    c: "var(--radio)",
    big: "4840D6",
    text: "Jedinstveni broj aviona (ICAO24), dodijeljen pri registraciji. Prva slova otkrivaju zemlju: 48xxxx je Nizozemska. Ovaj broj se ne mijenja, a po njemu se slažu sve poruke istog aviona.",
    textEn:
      "The aircraft's unique number (ICAO24), assigned at registration. The first digits reveal the country: 48xxxx is the Netherlands. It never changes, and all messages from the same aircraft are grouped by it.",
  },
  {
    name: "Sadržaj",
    nameEn: "Payload",
    from: 32,
    len: 56,
    c: "var(--data)",
    big: "vrsta 4 → ime leta: KLM1023",
    bigEn: "type 4 → flight name: KLM1023",
    text: "Prvih 5 bita kaže što je u sadržaju: 4 znači ime leta. Ostatak je 8 znakova po 6 bita:",
    textEn:
      "The first 5 bits say what the payload holds: 4 means the flight name. The rest is 8 characters of 6 bits each:",
    chars: true,
  },
  {
    name: "Provjera",
    nameEn: "Checksum",
    from: 88,
    len: 24,
    c: "var(--ok)",
    big: "576098",
    text: "Kontrolni broj izračunat iz ostatka poruke. Ako se signal putem ošteti, broj se ne slaže i prijamnik poruku odbaci.",
    textEn:
      "A check number computed from the rest of the message. If the signal gets damaged on the way, it no longer matches and the receiver discards the message.",
  },
];

function mountMessage({ root, signal, t, onLangChange }: AboutStoryContext) {
  const hexEl = root.querySelector<HTMLElement>("#hex");
  const grid = root.querySelector<HTMLElement>("#bitgrid");
  const fieldsEl = root.querySelector<HTMLElement>("#fields");
  const dec = root.querySelector<HTMLElement>("#decode");
  if (!hexEl || !grid || !fieldsEl || !dec) return;

  const F = MESSAGE_FIELDS;
  const bits = MESSAGE_HEX.split("")
    .map((h) => parseInt(h, 16).toString(2).padStart(4, "0"))
    .join("");
  const fieldOfBit = (i: number) => F.findIndex((f) => i >= f.from && i < f.from + f.len);

  hexEl.replaceChildren(
    ...MESSAGE_HEX.split("").map((h, i) => {
      const s = document.createElement("span");
      const field = fieldOfBit(i * 4 + 3);
      s.textContent = h;
      s.dataset.f = String(field);
      s.style.setProperty("--c", F[field].c);
      return s;
    })
  );
  grid.replaceChildren(
    ...bits.split("").map((b, i) => {
      const e = document.createElement("i");
      const field = fieldOfBit(i);
      e.textContent = b;
      e.dataset.f = String(field);
      e.style.setProperty("--c", F[field].c);
      return e;
    })
  );

  let cur = 2;
  const buttons = F.map((f, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.setProperty("--c", f.c);
    b.addEventListener("click", () => { pick(k); }, { signal });
    return b;
  });
  fieldsEl.replaceChildren(...buttons);

  function labelButtons() {
    buttons.forEach((b, k) => {
      b.textContent = `${t(F[k].name, F[k].nameEn)} · ${F[k].len}${t(" bita", " bits")}`;
    });
  }

  function pick(k: number) {
    const f = F[k];
    cur = k;
    buttons.forEach((b, j) => { b.setAttribute("aria-pressed", String(j === k)); });
    for (const el of [...hexEl!.children, ...grid!.children]) {
      el.classList.toggle("on", (el as HTMLElement).dataset.f === String(k));
    }
    dec!.style.setProperty("--c", f.c);
    let html = `<div class="tag" style="--c:${f.c}">${t(f.name, f.nameEn)}${t(" · bitovi ", " · bits ")}${f.from + 1}–${f.from + f.len}</div><div class="big">${t(f.big, f.bigEn ?? f.big)}</div><p>${t(f.text, f.textEn)}</p>`;
    if (f.chars) {
      html += '<div class="chars">';
      for (let i = 0; i < 8; i++) {
        const seg = bits.slice(40 + i * 6, 46 + i * 6);
        const c = MESSAGE_CHARSET[parseInt(seg, 2)];
        html += `<span>${seg}<b>${c === " " ? "␣" : c}</b></span>`;
      }
      html += "</div>";
    }
    dec!.innerHTML = html;
  }

  labelButtons();
  pick(cur);
  return onLangChange(() => {
    labelButtons();
    pick(cur);
  });
}

function mountLag({ root, signal, t, onLangChange }: AboutStoryContext) {
  const lag = root.querySelector<HTMLInputElement>("#lag");
  const out = root.querySelector<HTMLElement>("#lagout");
  const text = root.querySelector<HTMLElement>("#lagtxt");
  if (!lag || !out || !text) return;

  function update() {
    const s = Number(lag!.value);
    const m = Math.round(s * 231.6);
    const km = (d: number) => `${(m / 1000).toFixed(d).replace(".", t(",", "."))} km`;
    out!.textContent = `${s} s → ${m >= 1000 ? km(2) : `${m} m`}`;
    const dist = m >= 1000 ? km(1) : `${m} m`;
    text!.textContent =
      s === 0
        ? t("Bez kašnjenja točkica bi bila točno na avionu.", "With no delay, the dot would sit exactly on the aircraft.")
        : t(
            `Avion brzinom 834 km/h za ${s} s preleti ${dist}. Toliko bi točkica zaostajala bez predviđanja kretanja.`,
            `At 834 km/h an aircraft covers ${dist} in ${s} s. That is how far the dot would lag without motion prediction.`
          );
  }

  lag.addEventListener("input", update, { signal });
  update();
  return onLangChange(update);
}

const DALT_ALTITUDE_KM = 10;
const DALT_MOON_ELEVATION_DEG = 30;
const DALT_PLANE_PATH =
  "M 13 0 L 8 -1.4 L -1 -1.4 L -6 -9 L -9 -9 L -5 -1.4 L -11 -1.4 L -14 -5 L -16 -5 L -15 0 L -16 5 L -14 5 L -11 1.4 L -5 1.4 L -9 9 L -6 9 L -1 1.4 L 8 1.4 Z";

function mountElevationGap({ root, signal, t, onLangChange }: AboutStoryContext) {
  const inp = root.querySelector<HTMLInputElement>("#dalt-d");
  const side = root.querySelector<SVGSVGElement>("#dalt-side");
  const sky = root.querySelector<SVGSVGElement>("#dalt-sky");
  const read = root.querySelector<HTMLElement>("#dalt-read");
  const out = root.querySelector<HTMLElement>("#dalt-out");
  if (!inp || !side || !sky || !read || !out) return;

  const H = DALT_ALTITUDE_KM;
  const E = DALT_MOON_ELEVATION_DEG;
  const D0 = H / Math.tan((E * Math.PI) / 180);
  const num = (v: number, d: number) => v.toFixed(d).replace(".", t(",", "."));

  function draw() {
    const d = Number(inp!.value);
    const el = (Math.atan(H / d) * 180) / Math.PI;
    const da = el - E;
    const ad = Math.abs(da);
    const cls = ad <= 0.26 ? "ok" : ad <= 1.5 ? "warn" : "grey";
    const col = cls === "ok" ? "#57d68d" : cls === "warn" ? "#f0a03c" : "#8a93a6";
    const sc = 15;
    const ox = 40;
    const oy = 232;
    const py = oy - H * sc;
    const px = Math.min(625, ox + d * sc);
    const mx = ox + D0 * sc;
    const rayX = ox + (oy - 16) / Math.tan((E * Math.PI) / 180);
    const mono = 'font-size="11"';

    side!.innerHTML =
      `<line x1="0" y1="${oy}" x2="640" y2="${oy}" style="stroke:var(--line)" stroke-width="2"/>` +
      `<line x1="${ox}" y1="${py}" x2="640" y2="${py}" style="stroke:var(--faint)" stroke-dasharray="3 5"/>` +
      `<text x="632" y="${py - 6}" text-anchor="end" ${mono} style="fill:var(--muted)">${t("visina leta 10 km", "flight level 10 km")}</text>` +
      `<line x1="${ox}" y1="${oy}" x2="${rayX}" y2="16" style="stroke:var(--moon)" stroke-width="1.5"/>` +
      `<circle cx="${rayX + 4}" cy="12" r="10" fill="#dcdcd4"/>` +
      `<text x="${rayX + 20}" y="16" ${mono} style="fill:var(--muted)">${t("Mjesec 30°", "Moon 30°")}</text>` +
      `<circle cx="${mx}" cy="${py}" r="4" fill="none" stroke="#57d68d" stroke-width="1.5"/>` +
      `<line x1="${mx}" y1="${py + 6}" x2="${mx}" y2="${oy}" stroke="#57d68d" stroke-dasharray="2 4" opacity=".6"/>` +
      `<text x="${mx}" y="${oy + 14}" text-anchor="middle" ${mono} fill="#57d68d">${num(D0, 1)} km</text>` +
      `<line x1="${ox}" y1="${oy}" x2="${px}" y2="${py}" stroke="${col}" stroke-width="1.5" stroke-dasharray="5 4"/>` +
      `<g transform="translate(${px} ${py}) scale(1.1)"><path d="${DALT_PLANE_PATH}" fill="${col}"/></g>` +
      `<text x="${Math.min(600, px)}" y="${py - 16}" text-anchor="middle" ${mono} fill="${col}">${t("avion ", "aircraft ")}${num(el, 1)}°</text>` +
      `<text x="${px}" y="${oy + 14}" text-anchor="middle" ${mono} style="fill:var(--muted)">${num(d, 1)} km</text>` +
      `<circle cx="${ox}" cy="${oy}" r="6" style="fill:var(--data)"/>` +
      `<text x="${ox}" y="${oy - 12}" text-anchor="middle" ${mono} style="fill:var(--data)">${t("vi", "you")}</text>`;

    const ppd = 60;
    const y = 100 - da * ppd;
    const wing = Math.max(0.9, (((34 / (d * 1000)) * 180) / Math.PI) * (ppd / 30));
    let s =
      '<line x1="100" y1="0" x2="100" y2="200" stroke="rgba(255,255,255,.08)"/>' +
      '<line x1="0" y1="100" x2="200" y2="100" stroke="rgba(255,255,255,.08)"/>' +
      `<circle cx="100" cy="100" r="${0.26 * ppd}" fill="#dcdcd4"/>`;
    if (y < 8 || y > 192) {
      const up = y < 8;
      const ay = up ? 14 : 186;
      s +=
        `<path d="M 100 ${up ? 4 : 196} l -7 ${up ? 10 : -10} l 14 0 z" fill="${col}"/>` +
        `<text x="114" y="${ay + 4}" font-size="11" fill="${col}">${da > 0 ? "+" : "−"}${num(ad, 1)}°</text>`;
    } else {
      s +=
        `<g transform="translate(100 ${y}) scale(${wing})"><path d="${DALT_PLANE_PATH}" fill="${cls === "ok" ? "#111" : col}"${cls === "ok" ? ' stroke="#111"' : ""}/></g>` +
        `<line x1="20" y1="${y}" x2="185" y2="${y}" stroke="${col}" stroke-dasharray="3 4" opacity=".6"/>`;
    }
    s += `<text x="8" y="16" font-size="10" fill="#a6b0c6">${t("pogled kroz aparat", "through the lens")}</text>`;
    sky!.innerHTML = s;

    const msg =
      cls === "ok"
        ? t("Avion prolazi kroz disk. Ovo je tranzit.", "The aircraft passes through the disc. This is a transit.")
        : da < 0
          ? t("Avion je predaleko pa prolazi ispod Mjeseca.", "The aircraft is too far away, so it passes below the Moon.")
          : t("Avion je preblizu pa prolazi iznad Mjeseca.", "The aircraft is too close, so it passes above the Moon.");
    read!.innerHTML = `<span class="dbadge b-${cls}">Δalt ${da > 0 ? "+" : "−"}${num(ad, 2)}°</span><span>${msg}</span><span>${t("Savršena udaljenost: ", "Perfect distance: ")}${num(D0, 1)} km</span>`;
    out!.textContent = `${num(d, 1)} km`;
    side!.setAttribute(
      "aria-label",
      t(
        "Bočni pogled: promatrač, linija prema Mjesecu na 30° i avion na 10 km visine",
        "Side view: observer, line to the Moon at 30° and an aircraft at 10 km altitude"
      )
    );
    sky!.setAttribute(
      "aria-label",
      t(
        "Pogled kroz aparat: položaj aviona u odnosu na disk Mjeseca",
        "Through the lens: aircraft position relative to the Moon's disc"
      )
    );
  }

  inp.addEventListener("input", draw, { signal });
  draw();
  return onLangChange(draw);
}

function mountChapterNav({ root, signal }: AboutStoryContext) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const list = root.querySelector<HTMLElement>("nav.chapters ol");
  const links = [...root.querySelectorAll<HTMLAnchorElement>("nav.chapters a")];
  const sections = links.map((a) => root.querySelector(a.getAttribute("href") ?? ""));

  function markActive() {
    let idx = -1;
    sections.forEach((s, i) => {
      if (s && s.getBoundingClientRect().top <= 120) idx = i;
    });
    links.forEach((a, i) => { a.classList.toggle("on", i === idx); });
    if (idx >= 0 && list && !reduce) {
      list.scrollLeft = (links[idx].parentElement?.offsetLeft ?? 16) - 16;
    }
  }

  window.addEventListener("scroll", markActive, { passive: true, signal });
  markActive();
}

/** Spaja sve ne-3D dijelove stranice. Vraća čišćenje za izlazak s rute. */
export function mountAboutStory(root: HTMLElement): {
  context: AboutStoryContext;
  dispose: () => void;
} {
  const controller = new AbortController();
  const { signal } = controller;
  const listeners = new Set<() => void>();
  let lang: AboutLang = root.lang === "hr" ? "hr" : "en";

  const context: AboutStoryContext = {
    root,
    signal,
    t: (hr, en) => (lang === "en" ? en : hr),
    onLangChange(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };

  function applyLang() {
    root.lang = lang;
    document.title = context.t("Od aviona do LunaPica", "From Aircraft to LunaPic");
    for (const [selector, attribute, hr, en] of ARIA_LABELS) {
      root.querySelector(selector)?.setAttribute(attribute, context.t(hr, en));
    }
    for (const b of root.querySelectorAll<HTMLButtonElement>(".lang button")) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    }
    for (const fn of listeners) fn();
  }

  const cleanups = [
    mountMessage(context),
    mountLag(context),
    mountElevationGap(context),
    mountChapterNav(context),
  ];

  root.addEventListener(
    "click",
    (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>(".lang button");
      const next = button?.dataset.lang;
      if ((next !== "hr" && next !== "en") || next === lang) return;
      lang = next;
      document.cookie = `${ABOUT_LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      applyLang();
    },
    { signal }
  );

  const { hash } = location;
  const fromHash = hash === "#hr" || hash === "#en" ? (hash.slice(1) as AboutLang) : null;
  lang = fromHash ?? readAboutLangCookie(document.cookie) ?? lang;
  applyLang();

  if (hash && !fromHash) root.querySelector(hash)?.scrollIntoView();

  return {
    context,
    dispose() {
      controller.abort();
      listeners.clear();
      for (const fn of cleanups) fn?.();
    },
  };
}
