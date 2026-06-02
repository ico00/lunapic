"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

const proTip = {
  title: "Pro Tip",
  body: "Keep observer fixed first, then tune focal length and sensor in Photographer tools, and finally use corridor confidence + green-flight candidates together. That sequence gives the most reliable field decisions.",
} as const;

type FaqItem = { question: string; answer: string };

const faqSections: { title: string; items: FaqItem[] }[] = [
  {
    title: "Getting started",
    items: [
      {
        question: "How do I use LunaPic in 60 seconds?",
        answer:
          "1. Set your observer location — tap the GPS button in the Observer panel, or drag the camera marker on the map to your exact tripod spot.\n\n2. Open Photographer tools and enter your focal length and sensor size. This drives all feasibility scoring and the green/blue aircraft coloring on the map.\n\n3. Choose a live flight source (OpenSky or ADS-B One). Aircraft populate the map within seconds.\n\n4. Watch the Transit Candidates panel. It automatically lists flights that will cross or enter the moon disc from your standpoint. Rows marked ⊙ are full disk transits — the plane will geometrically pass in front of the moon.\n\n5. Select a candidate row. Photographer tools shows a countdown to alignment and a shot-feasibility rating. Active Transits shows a nudge arrow with the direction and distance to walk for the optimal stand.\n\n6. Get there before the countdown hits zero.",
      },
      {
        question: "How do I navigate the interface?",
        answer:
          "The map fills the entire screen and all controls float on top.\n\nDesktop: a vertical icon rail on the right edge opens side panels — click an icon to expand the panel drawer. A search bar sits centred at the top.\n\nMobile: a dock at the bottom has four quick-access pills — Active, Tracks, Photo, Moon — plus a More button for the remaining panels. Tap any pill to open that panel as a slide-up sheet.\n\nThe observer camera marker is always visible on the map — drag it to reposition.",
      },
      {
        question: "How does the Observer point behave, and can I drag it?",
        answer:
          "Yes — the camera marker on the map is draggable. Press and hold (or click-drag on desktop) the camera icon and move it to any position. All ephemeris calculations, transit geometry, and corridor math instantly recalculate for the new location.\n\nThe observer point is fixed — it does not follow map pan. That is intentional: the entire app is anchored to this one precise standpoint.\n\nOther ways to set the observer: tap the location button in the Observer panel to use your device's GPS; type coordinates directly; or use \"Set my location here\" to pin the current map view centre as the observer.\n\nConsumer GPS can have several metres of error, so dragging the marker to a precise tripod spot (a rooftop corner, a specific kerb) is often more useful than raw GPS.",
      },
      {
        question: "What does Flight source control?",
        answer:
          "Three live sources are available:\n\nOpenSky Network — crowdsourced ADS-B/MLAT, global coverage, free anonymous access with rate limits (429). A free OpenSky account configured in the server environment raises those limits.\n\nADS-B One — community-run, rate-limited (~1 request/s per IP); the app caches and debounces map moves to stay within limits.\n\nLunaPic ADS-B — a local receiver (Raspberry Pi running dump1090 or readsb) reachable over your network. No external rate limits; best for low-latency coverage of your exact area when you control the antenna.\n\nAll three are proxied on the server and return traffic for a bounded area around your observer. FlightRadar24 and other aggregators are not wired in — any external map can still differ from the feed you selected (different receivers, MLAT, partners).",
      },
    ],
  },
  {
    title: "Map overlays",
    items: [
      {
        question: "What does the long moon line on the map mean?",
        answer:
          "It is the moon azimuth from your observer point (compass direction to look). It updates with slider time, so when you scrub time, this line rotates to the moon direction for that instant.",
      },
      {
        question: "What is the cyan band and pale center line when an aircraft is selected?",
        answer:
          "Cyan band + pale center line: the ground strip and zero-offset line (3D line-of-sight, aircraft altitude) for the current slider time only — the direction you move along the ground to line up the hull with the moon's center at your fixed observer. Zoom out if the band is off-screen.",
      },
      {
        question: "Why are some aircraft a different color?",
        answer:
          "Aircraft colors depend on two settings:\n\nAltitude tint ON (default): each aircraft is colored by altitude — red (ground / approach), orange, gold, green, blue (cruise ~35–45k ft), purple (high / bizjet). Mint green (#34d399) overrides the altitude color for any aircraft that is shot-feasible (both a mathematical transit overlap and optical feasibility for your camera setup).\n\nAltitude tint OFF: all non-feasible aircraft switch to a single neutral grey tone; shot-feasible aircraft stay mint. Toggle the checkbox in the altitude legend on the map.\n\nColors update live as flights, time, and settings change.",
      },
      {
        question: "What does the altitude color bar on the map mean?",
        answer:
          "The bar is a quick height scale (MSL): map symbols run from light emerald (low) through emerald into sky blue and deep sky at high cruise, by reported baro/geo altitude. Tick labels under the bar default to short kilometre marks (0m, 2k, 4.5k … = 0 m, 2 km, 4.5 km, and so on). km / ft on the same row as the legend title switch ticks to compact thousands of feet (labels only; colors and geometry stay in metres). Mint (#34d399, the app's \"ready / feasible\" accent) still marks shot-feasible aircraft — same meaning as elsewhere on the map, even if that hue appears in the mid-altitude part of the scale. The checkbox beside Aircraft color by altitude (MSL) turns the height scale off so other traffic uses one neutral tone; shot-feasible flights stay highlighted. The 3D aircraft marker also scales a bit with altitude.",
      },
      {
        question: "What is the green transit opportunity corridor?",
        answer:
          "It is an observer-centric map corridor that marks where transit chance is strongest for your current moon geometry and camera setup. Confidence bands show LOW / MEDIUM / HIGH likelihood, and the corridor appears only when moon visibility is in the Optimal tier.",
      },
      {
        question: "Does the corridor guarantee a shot if a plane enters it?",
        answer:
          "No. Treat it as a high-quality positioning and timing filter, not a guarantee. Final success still depends on real aircraft track updates, feed latency, exact transit timing, and field conditions.",
      },
      {
        question: "What is the VFR aeronautical chart layer?",
        answer:
          "The VFR layer overlays an aeronautical sectional chart on top of the base map — the same visual used by general aviation pilots for visual flight rules navigation. It shows airport symbols, airspace boundaries (Class B/C/D/E), airways, navigation aids (VORs, NDBs), terrain contours, and visual landmarks.\n\nFor moon transit photography, this is mainly useful context: you can quickly see which airports and flight paths are near your observer, which helps anticipate the kinds of traffic (commercial approach routes, GA traffic patterns, training areas) that may cross your field of view.\n\nToggle it from the Layers control on the map. VFR chart tiles are fetched from a third-party tile source and may not always match the most current published charts.",
      },
      {
        question: "What other base map layers are available?",
        answer:
          "The Layers control on the map lets you switch between several options:\n\nSatellite — aerial/satellite imagery; useful for scouting a field location and checking for obstructions (trees, buildings) before heading out.\n\nStreet — standard road map; good for navigation.\n\nVFR — aeronautical sectional chart overlay (see the dedicated FAQ entry above).\n\nStreet View — embeds an interactive Google Street View panorama at the observer location with moon and flight overlays (see the Street View FAQ entry).\n\nLayers can be combined (e.g. Street View on top of Satellite) where the UI permits.",
      },
    ],
  },
  {
    title: "Panels",
    items: [
      {
        question: "How should I read Moon (nowcast)?",
        answer:
          "Altitude is moon height above horizon (degrees), azimuth is compass direction from true north, and angular radius is apparent moon size. Illuminated is the percentage of the lunar disk lit as seen from Earth (0% = new moon, 100% = full moon). Visibility Advice flags low-altitude cases where the moon may be technically up but hard to see in practice.\n\nWhen you keep the default balcony observer and the simulated moon lands in a narrow band around a saved reference (height, direction, near-full phase), an Ideal for transit watch callout appears — a cue that conditions match that reference session.\n\nCopy field note copies observer coordinates, ground elevation (m), simulation instant, all numbers, rise/set times, and visibility text to the clipboard.",
      },
      {
        question: "How does the Compass → Moon panel work?",
        answer:
          "Goal. Hold the phone flat like a map (screen facing you). The compass rose (ticks + N/E/S/W) rotates with your device heading so cardinals stay lined up with the horizon (best effort from the sensor). The fixed triangle at 12 o'clock marks the top of the phone — your forward direction in the horizontal plane. The amber needle shows the shortest turn from that forward direction to the moon's azimuth: when it points straight up to the triangle, you are aimed correctly.\n\nSensors. On many iPhones, Safari exposes a compass-derived heading; elsewhere the fallback is often alpha (attitude), which can drift. This is a field helper, not survey-grade north.\n\nField use. Prefer open air. Move away from cars, rebar, large steel, and speakers — they skew the magnetic field. If the needle jitters, walk a few steps, re-level the phone, and wait for the value below the disc to settle.\n\nLimits. Azimuth only. It does not tell you moon altitude — use Moon (nowcast) and the map for elevation.",
      },
      {
        question: "What does Active Transits show?",
        answer:
          "Active Transits lists aircraft whose azimuth from your observer (corrected for aircraft altitude) is within 0.5° of the moon's azimuth — they are currently on the \"yellow ray\" where a geometric transit is happening. Each row shows callsign and delta azimuth (Δ) in blue.\n\nNudge arrow. Tap a row to select it. A nudge arrow appears below the list showing how many metres to walk and in which compass direction to reach the optimal stand where the transit centres exactly. When you close within 5 m, the arrow is replaced by a green Centered indicator and a short double chime plays.\n\nThe list only populates when moon visibility is in the Optimal tier. If it is empty, no aircraft are on the ray right now.",
      },
      {
        question: "How do transit alerts and notifications work?",
        answer:
          "Turn on Transit alerts with the bell icon in the Transit Candidates panel header. You are then warned the moment a flight is predicted to cross the moon disc, or enters an active transit right now.\n\nApp open and on screen: an ATC-style sound (squelch + beep) plays and an in-app banner appears.\n\nScreen off, app in the background, or fully closed: you get a system push notification (banner + vibration). This keeps working even when LunaPic is not open because detection runs on the server — once you subscribe, your observer location and camera settings are remembered server-side and the server keeps checking for transits for you.\n\nFirst time: tapping the bell asks the browser for notification permission — choose Allow. On iPhone, push only works if you add LunaPic to the Home Screen (Share → Add to Home Screen) and open it from there; the alert then uses your phone's system notification sound (iOS does not allow a custom sound or vibration for web notifications).\n\nTurn the bell off to stop notifications. If you move your observer or change your camera, the saved settings update automatically.",
      },
      {
        question: "What is the countdown in Photographer tools?",
        answer:
          "It is an estimate of time until the selected plane's direction aligns with the moon direction from your observer. It is meant as a practical shooting aid, not a perfect physical simulation.",
      },
      {
        question: "How do camera settings affect results?",
        answer:
          "Focal length and sensor crop (set in Photographer tools) define effective focal length. That value drives optical feasibility scoring and green/blue map filtering, so realistic camera settings are important.",
      },
      {
        question: "What time basis does Photographer tools use?",
        answer:
          "Pick a flight from the list or map. The moon position is computed for the current wall-clock time (Sync). The aircraft side extrapolates a little ahead from the latest feed position using reported ground speed and track so the countdown stays usable between feed refreshes; it is not a full flight simulator.",
      },
      {
        question: "What do Field sounds do?",
        answer:
          "Turn Sounds on after selecting an aircraft. On iPhone, turn off the silent switch and raise ringer volume; the first Sounds on tap plays a short unlock ping and links Web Audio to your finger (Safari otherwise keeps timer-driven sounds silent). Sync time to now also unlocks the shared audio context quietly.\n\nSounds: a chime when the selected aircraft enters the green map filter; a soft hold tone while it stays in the moon-overlap disc model; countdown beeps when timing data exists.",
      },
      {
        question: "What does OpenSky latency skew do?",
        answer:
          "The slider in the Field overlays panel lets you offset aircraft extrapolation relative to wall-clock time to compensate for feed delay. If the app shows a plane slightly behind where it looks in the sky, nudge the skew forward. Moon ephemeris is not affected — only aircraft positions shift.",
      },
      {
        question: "How does AR Sky Camera work?",
        answer:
          "AR Sky Camera opens a full-screen live camera view and overlays aircraft position markers locked to where the actual planes are in the sky. Using device orientation sensors (compass + tilt), the app places each callsign label at its correct azimuth and elevation.\n\nThe moon appears as an amber circle. When the moon or any aircraft is off-screen, an edge arrow guides you to rotate toward it. A small radar disc in the bottom-right corner shows all tracked aircraft relative to your current camera heading — useful for spotting traffic behind you.\n\nTap any callsign label to select that flight and open its data card at the top of the screen. Selecting here also highlights it on the main map.\n\nAll nearby mode shows all tracked flights; Only focused limits markers to the selected flight and top transit candidates. If compass heading drifts, point the phone toward a known bearing and tap Recenter.\n\nRequires camera and orientation permissions. On iPhone Safari a compass-derived heading is used; on other browsers the fallback may drift more.",
      },
      {
        question: "How does Street View work?",
        answer:
          "Street View is available as a map layer — toggle it from the Layers control on the map. It opens a Google Street View panorama centred on your observer location and adds a live canvas overlay.\n\nOverlay elements: the moon's current position as an amber disc with crosshair; its path over a ±4-hour window (past samples faded, future samples brighter); aircraft silhouettes for transit candidates and active transits. Active transit aircraft (on the \"yellow ray\") appear in cyan with trajectory dots and callsign + altitude; other candidates appear dimmer in purple.\n\nThe panorama auto-rotates to face the moon's azimuth on load. Drag freely to look around — the overlay repaints in sync. A full-screen exit button is available in the top-right corner.\n\nIf no Street View panorama is available within 100 m of your observer, a notice is shown instead. Street View requires a Google Maps API key in the deployment configuration.",
      },
    ],
  },
];

const allFaqs = faqSections.flatMap((s) => s.items);

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: allFaqs.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer.replace(/\*\*/g, ""),
    },
  })),
};

function normalizeSearch(s: string): string {
  return s.trim().toLowerCase();
}

function highlightText(text: string, query: string): ReactNode {
  const raw = query.trim();
  if (!raw) return text;
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <mark
        key={k++}
        className="rounded-sm px-0.5 text-inherit"
        style={{ background: "var(--moon-soft)", color: "var(--moon)" }}
      >
        {m[0]}
      </mark>
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length > 0 ? out : text;
}

function FaqEntry({
  item,
  idx,
  openIdx,
  onToggle,
  isSearchActive,
  search,
}: {
  item: FaqItem;
  idx: number;
  openIdx: number;
  onToggle: (idx: number) => void;
  isSearchActive: boolean;
  search: string;
}) {
  const expanded = isSearchActive || openIdx === idx;
  return (
    <section
      className="rounded-xl px-1 py-4 transition-colors"
      style={expanded ? { background: "var(--glass-highlight)" } : undefined}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-start justify-between gap-4 rounded-lg px-2 py-0.5 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-default"
        disabled={isSearchActive}
        onClick={() => {
          if (isSearchActive) return;
          onToggle(idx);
        }}
        aria-expanded={expanded}
        aria-controls={`faq-answer-${idx}`}
      >
        <span
          className="text-base font-semibold leading-7 sm:text-lg"
          style={{ color: "var(--t-primary)" }}
        >
          {isSearchActive ? highlightText(item.question, search) : item.question}
        </span>
        {!isSearchActive ? (
          <span
            className="mt-0.5 shrink-0 text-xl leading-none transition-colors"
            style={{
              color: openIdx === idx ? "var(--moon)" : "var(--t-disabled)",
            }}
          >
            {openIdx === idx ? "−" : "+"}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <p
          id={`faq-answer-${idx}`}
          className="mt-3 whitespace-pre-line px-2 pr-8 text-[15px] leading-relaxed"
          style={{ color: "var(--t-secondary)" }}
        >
          {isSearchActive ? highlightText(item.answer, search) : item.answer}
        </p>
      ) : null}
    </section>
  );
}

export default function AboutPage() {
  const [openIdx, setOpenIdx] = useState(0);
  const [search, setSearch] = useState("");

  const queryNorm = normalizeSearch(search);
  const isSearchActive = queryNorm.length > 0;

  const matchedFaqs = useMemo(() => {
    if (!isSearchActive) return allFaqs;
    return allFaqs.filter(
      (item) =>
        item.question.toLowerCase().includes(queryNorm) ||
        item.answer.toLowerCase().includes(queryNorm)
    );
  }, [isSearchActive, queryNorm]);

  const proTipMatches = useMemo(() => {
    if (!isSearchActive) return true;
    return (
      proTip.title.toLowerCase().includes(queryNorm) ||
      proTip.body.toLowerCase().includes(queryNorm)
    );
  }, [isSearchActive, queryNorm]);

  const matchCount =
    matchedFaqs.length + (proTipMatches && isSearchActive ? 1 : 0);

  const handleToggle = (idx: number) => {
    setOpenIdx((prev) => (prev === idx ? -1 : idx));
  };

  // Pre-compute global offset for each section so FaqEntry gets a stable idx
  const sectionOffsets = useMemo(
    () =>
      faqSections.reduce<number[]>((acc, _, i) => {
        acc.push(i === 0 ? 0 : acc[i - 1] + faqSections[i - 1].items.length);
        return acc;
      }, []),
    []
  );

  return (
    <div
      className="min-h-dvh w-full overflow-x-hidden px-4 py-10 sm:px-6 lg:px-8"
      style={{ backgroundColor: "var(--bg-0)" }}
    >
      <script
        type="application/ld+json"
        // Safe here: source is local static content, not user-generated.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="mx-auto max-w-5xl">

        {/* Header card */}
        <header
          className="relative overflow-hidden rounded-[22px] border p-7 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-[28px]"
          style={{
            background: "var(--glass-2)",
            borderColor: "var(--glass-stroke-strong)",
          }}
        >
          <div
            className="pointer-events-none absolute left-6 right-6 top-0 h-[1.5px] rounded-full"
            style={{
              background:
                "linear-gradient(90deg, var(--moon) 0%, rgba(251,191,36,0.3) 50%, transparent 100%)",
            }}
            aria-hidden
          />

          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="LunaPic logo"
              width={40}
              height={40}
              decoding="async"
              className="h-10 w-auto object-contain"
            />
            <span className="mt-title text-2xl leading-none">LunaPic</span>
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl mt-title">
            About / FAQ
          </h1>
          <p
            className="mt-3 max-w-3xl text-base leading-relaxed"
            style={{ color: "var(--t-secondary)" }}
          >
            Short, practical answers for reading panels, map overlays, and field
            workflow.
          </p>
          <div
            className="mt-6 rounded-[14px] border px-5 py-5 text-[15px] leading-relaxed"
            style={{
              background: "var(--glass-3)",
              borderColor: "var(--glass-stroke)",
              color: "var(--t-secondary)",
            }}
          >
            <p>
              LunaPic is a vibe-code hobbyist pet project built by Ivica Drusany, an amateur
              photographer with zero knowledge of astronomy and coding with one specific goal in
              mind: capturing the perfect moon transit shot of an aircraft passing in front of
              the moon.
            </p>
            <p className="mt-3">
              That kind of shot demands precise timing and positioning that is nearly impossible
              to eyeball, so this tool was built to take the guesswork out of it.
            </p>
            <p className="mt-3">
              There is no commercial agenda here, just a waste of time and money and to test AI
              and vibe coding.
            </p>
            <p className="mt-3">
              The app tracks real flight traffic in my area, calculates when an aircraft will
              geometrically cross the moon as seen from observer standpoint, and guides you to
              the right spot on the ground, so if you want a perfect shot, prepare to run.
            </p>
            <p className="mt-3">
              If you are an astro-photographer, a plane-spotter, or simply curious you are more
              than welcome to use LunaPic.
            </p>
          </div>

          {/* Name etymology */}
          <div
            className="mt-4 rounded-[14px] border px-5 py-4"
            style={{
              background: "var(--glass-3)",
              borderColor: "var(--glass-stroke)",
            }}
          >
            <p
              className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--moon)" }}
            >
              The name
            </p>
            <ul className="space-y-1.5 text-[14px]" style={{ color: "var(--t-secondary)" }}>
              <li>
                <span style={{ color: "var(--t-primary)" }}>Lūna</span>
                {" — Moon in Latin"}
              </li>
              <li>
                <span style={{ color: "var(--t-primary)" }}>Pic</span>
                {" — Picture in English"}
              </li>
              <li>
                <span style={{ color: "var(--t-primary)" }}>LunaPic</span>
                {" — a combination that sounds like "}
                <span style={{ color: "var(--moon)" }}>lunatic</span>
                {", which for sure we are if we are wasting time on this"}
              </li>
            </ul>
          </div>
          <div className="mt-5">
            <Link
              href="/"
              className="mt-toolbar-btn inline-flex gap-2 px-4 text-sm"
              style={{ color: "var(--t-primary)" }}
            >
              <svg
                className="size-4 shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to planner
            </Link>
          </div>
        </header>

        {/* FAQ main card */}
        <main
          className="mt-8 overflow-hidden rounded-[22px] border backdrop-blur-[28px]"
          style={{
            background: "var(--glass-1)",
            borderColor: "var(--glass-stroke)",
            boxShadow: "var(--shadow-2)",
          }}
        >
          <div
            className="pointer-events-none h-[1.5px] w-full"
            style={{
              background:
                "linear-gradient(90deg, var(--sky) 0%, rgba(96,165,250,0.25) 60%, transparent 100%)",
            }}
            aria-hidden
          />

          <div className="p-4 sm:p-6">
            {/* Title + search row */}
            <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <h2
                className="text-2xl font-semibold tracking-tight sm:text-3xl"
                style={{ color: "var(--t-primary)" }}
              >
                Frequently asked questions
              </h2>
              <div className="w-full shrink-0 sm:max-w-sm">
                <label htmlFor="about-faq-search" className="sr-only">
                  Search FAQ and tips
                </label>
                <input
                  id="about-faq-search"
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  placeholder="Search all answers…"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-[12px] border px-3 py-2 text-[16px] outline-none transition"
                  style={{
                    background: "var(--glass-3)",
                    borderColor: "var(--glass-stroke-strong)",
                    color: "var(--t-primary)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--sky-line)";
                    e.currentTarget.style.boxShadow =
                      "0 0 0 2px var(--sky-soft)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor =
                      "var(--glass-stroke-strong)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                {isSearchActive ? (
                  <p
                    className="mt-1.5 text-xs"
                    style={{ color: "var(--t-tertiary)" }}
                    aria-live="polite"
                  >
                    {matchCount === 0
                      ? "No matches (searches collapsed FAQ answers too)."
                      : `${matchCount} section${matchCount === 1 ? "" : "s"} match.`}
                  </p>
                ) : null}
              </div>
            </div>

            {/* FAQ body */}
            {isSearchActive ? (
              // Flat filtered list
              <div
                className="divide-y"
                style={{ borderColor: "var(--glass-stroke)" }}
              >
                {matchedFaqs.length === 0 && !proTipMatches ? (
                  <p
                    className="py-6 text-center text-sm"
                    style={{ color: "var(--t-tertiary)" }}
                  >
                    No results. Try another word — search includes text inside
                    collapsed FAQ answers.
                  </p>
                ) : null}
                {matchedFaqs.map((item, idx) => (
                  <FaqEntry
                    key={item.question}
                    item={item}
                    idx={idx}
                    openIdx={openIdx}
                    onToggle={handleToggle}
                    isSearchActive={isSearchActive}
                    search={search}
                  />
                ))}
              </div>
            ) : (
              // Grouped sections
              <div className="space-y-2">
                {faqSections.map((section, sIdx) => {
                  const baseIdx = sectionOffsets[sIdx];
                  return (
                    <div key={section.title}>
                      <div className="px-2 pb-1 pt-5">
                        <span
                          className="text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: "var(--sky)" }}
                        >
                          {section.title}
                        </span>
                      </div>
                      <div
                        className="divide-y"
                        style={{ borderColor: "var(--glass-stroke)" }}
                      >
                        {section.items.map((item, iIdx) => (
                          <FaqEntry
                            key={item.question}
                            item={item}
                            idx={baseIdx + iIdx}
                            openIdx={openIdx}
                            onToggle={handleToggle}
                            isSearchActive={isSearchActive}
                            search={search}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pro Tip */}
            {(!isSearchActive || proTipMatches) && (
              <section
                className="mt-6 rounded-[14px] border px-4 py-4"
                style={{
                  background: "var(--moon-soft)",
                  borderColor: "var(--moon-line)",
                }}
              >
                <h2
                  className="text-xs font-semibold uppercase tracking-[0.2em]"
                  style={{ color: "var(--moon)" }}
                >
                  {isSearchActive
                    ? highlightText(proTip.title, search)
                    : proTip.title}
                </h2>
                <p
                  className="mt-2 text-[15px] leading-relaxed"
                  style={{ color: "var(--t-secondary)" }}
                >
                  {isSearchActive
                    ? highlightText(proTip.body, search)
                    : proTip.body}
                </p>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
