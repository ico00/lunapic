"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

const proTip = {
  title: "Pro Tip",
  body: "Keep observer fixed first, then tune focal length and sensor in Photographer tools, and finally use corridor confidence + green-flight candidates together. That sequence gives the most reliable field decisions.",
} as const;

const faqs = [
  {
    question: "How do I use LunaPic in 60 seconds?",
    answer:
      "Set observer location first, then pick time with the slider, choose flight source, and select an aircraft. The right-side field tools then show timing, feasibility, and stand guidance for that exact simulated moment.",
  },
  {
    question: "What does Flight source control?",
    answer:
      "OpenSky provides real ADS-B traffic for a bounded area around your observer and the map (demo corridor rules can apply near static routes). Symbols are smoothed between refreshes on slower devices. Static uses simulated points from routes.json. Heavy OpenSky use can hit anonymous rate limits (429); adding a free OpenSky account in server .env.local (OPENSKY_API_*, see .env.local.example) raises limits. Route-region average-speed diagnostics use aircraft currently in the air with valid speed samples from the visible map corridor.",
  },
  {
    question: "How does the Observer point behave?",
    answer:
      "Observer is a fixed point and does not follow map pan; all ephemeris and intersection math is anchored to this location. On first open, if you are still on the built-in default observer, the app asks once for device location permission so you can quickly switch to your real field position.",
  },
  {
    question: "What does the long moon line on the map mean?",
    answer:
      "It is the moon azimuth from your observer point (compass direction to look). It updates with slider time, so when you scrub time, this line rotates to the moon direction for that instant.",
  },
  {
    question: "How does the Compass → Moon panel work?",
    answer:
      "Goal. Hold the phone flat like a map (screen facing you). The compass rose (ticks + N/E/S/W) rotates with your device heading so cardinals stay lined up with the horizon (best effort from the sensor). The fixed triangle at 12 o'clock marks the top of the phone — your forward direction in the horizontal plane. The amber needle is the shortest turn from that forward direction to the moon's azimuth: when it points straight up to the triangle, you are aimed correctly. Moon azimuth uses true north at 0°, increasing clockwise; ephemeris does not apply magnetic declination.\n\nSensors. The browser reports device orientation. On many iPhones, Safari exposes a compass-derived heading; elsewhere the fallback is often alpha (attitude), which behaves more like an estimated bearing and can drift. This is a field helper, not survey-grade north.\n\nField use. Prefer open air with a clear view toward the moon. Move away from cars, rebar, large steel, speakers, and strong currents — they skew the Earth's magnetic field and confuse compass heading. If the needle jitters, walk a few steps, re-level the phone, and wait for the value below the disc to settle.\n\nLimits. This panel is plan view only (azimuth on the ground). It does not tell you moon altitude; use Moon (nowcast) and the map for elevation. Your lens still needs to be pointed up at the correct elevation to frame the disc — the compass only lines up the horizontal aim.",
  },
  {
    question: "How should I read Moon (nowcast)?",
    answer:
      "Altitude is moon height above horizon (degrees), azimuth is compass direction from true north, and angular radius is apparent moon size. Visibility Advice flags low-altitude cases where the moon may be technically up but hard to see in practice.",
  },
  {
    question: "What is the countdown in Photographer tools?",
    answer:
      "It is an estimate of time until plane direction aligns with moon direction from your observer position. It is meant as a practical shooting aid, not a perfect physical simulation.",
  },
  {
    question: "What time basis does Photographer — tools use?",
    answer:
      "Pick a flight from the list or map. Times use the slider time for the moon and a short forward guess for the plane (speed + heading from the flight feed). The moon side is tied to the simulated instant you set on the time slider. The aircraft side extrapolates a little ahead from the latest feed using reported ground speed and track so the countdown stays usable between refreshes; it is not a full flight simulator.",
  },
  {
    question: "How do camera settings affect results?",
    answer:
      "Focal length and sensor crop (set in Photographer — tools) define effective focal length. That value drives optical feasibility scoring and green/blue map filtering, so realistic camera settings are important.",
  },
  {
    question: "Why are some aircraft blue and some green?",
    answer:
      "Blue is normal tracked traffic. Green means both conditions are true: mathematically overlapping transit and optical feasibility for your current camera setup. Colors update live as flights/time/settings change.",
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
    question: "What does OpenSky latency skew do?",
    answer:
      "It shifts aircraft extrapolation relative to wall-clock time to compensate feed delay. It does not move moon ephemeris or slider time, so moon geometry stays anchored to the selected simulation instant.",
  },
];

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
        className="rounded-sm bg-amber-400/35 px-0.5 text-inherit"
      >
        {m[0]}
      </mark>
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length > 0 ? out : text;
}

export default function AboutPage() {
  const [openIdx, setOpenIdx] = useState(0);
  const [search, setSearch] = useState("");

  const queryNorm = normalizeSearch(search);
  const isSearchActive = queryNorm.length > 0;

  const matchedFaqs = useMemo(() => {
    if (!isSearchActive) return faqs;
    return faqs.filter(
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

  return (
    <div className="min-h-dvh w-full bg-[#070f2a] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-white/10 bg-[#0a1533]/85 px-7 py-7 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.22em] text-zinc-400">
            LunaPic
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            About / FAQ
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-300">
            Short, practical answers for reading panels, map overlays, and field
            workflow.
          </p>
          <div className="mt-5">
            <Link
              href="/"
              className="inline-flex rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/10"
            >
              Back to planner
            </Link>
          </div>
        </header>

        <main className="mt-8 rounded-3xl border border-white/10 bg-[#0a1533]/80 p-3 backdrop-blur-xl sm:p-4">
          <div className="flex flex-col gap-3 px-3 pb-4 pt-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
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
                className="w-full rounded-xl border border-white/15 bg-[#070f2a]/80 px-3 py-2 text-sm text-zinc-100 shadow-inner shadow-black/20 outline-none ring-emerald-400/40 placeholder:text-zinc-500 focus:border-emerald-400/50 focus:ring-2"
              />
              {isSearchActive ? (
                <p className="mt-1.5 text-xs text-zinc-500" aria-live="polite">
                  {matchCount === 0
                    ? "No matches (searches collapsed FAQ answers too)."
                    : `${matchCount} section${matchCount === 1 ? "" : "s"} match.`}
                </p>
              ) : null}
            </div>
          </div>
          <div className="divide-y divide-white/10">
            {isSearchActive && matchedFaqs.length === 0 && !proTipMatches ? (
              <p className="px-3 py-6 text-center text-sm text-zinc-400 sm:px-4">
                No results. Try another word — search includes text inside
                collapsed FAQ answers.
              </p>
            ) : null}
            {(isSearchActive ? matchedFaqs : faqs).map((item, idx) => {
              const expanded = isSearchActive || openIdx === idx;
              return (
                <section
                  key={item.question}
                  className={`rounded-2xl px-3 py-4 sm:px-4 ${
                    expanded ? "bg-white/[0.03]" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-start justify-between gap-4 text-left disabled:cursor-default"
                    disabled={isSearchActive}
                    onClick={() => {
                      if (isSearchActive) return;
                      setOpenIdx((prev) => (prev === idx ? -1 : idx));
                    }}
                    aria-expanded={expanded}
                    aria-controls={`faq-answer-${idx}`}
                  >
                    <span className="text-lg font-semibold leading-7 text-zinc-100 sm:text-xl">
                      {isSearchActive
                        ? highlightText(item.question, search)
                        : item.question}
                    </span>
                    {!isSearchActive ? (
                      <span
                        className={`mt-0.5 shrink-0 text-2xl leading-none transition ${
                          openIdx === idx ? "text-emerald-300" : "text-zinc-400"
                        }`}
                      >
                        {openIdx === idx ? "−" : "+"}
                      </span>
                    ) : null}
                  </button>
                  {expanded ? (
                    <p
                      id={`faq-answer-${idx}`}
                      className="mt-3 whitespace-pre-line pr-8 text-base leading-relaxed text-zinc-300"
                    >
                      {isSearchActive
                        ? highlightText(item.answer, search)
                        : item.answer}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
          {(!isSearchActive || proTipMatches) && (
            <section className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
                {isSearchActive
                  ? highlightText(proTip.title, search)
                  : proTip.title}
              </h2>
              <p className="mt-2 text-base leading-relaxed text-zinc-200">
                {isSearchActive
                  ? highlightText(proTip.body, search)
                  : proTip.body}
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

