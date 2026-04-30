"use client";

import Link from "next/link";
import { useState } from "react";

const faqs = [
  {
    question: "How do I use LunaPic in 60 seconds?",
    answer:
      "Set observer location first, then pick time with the slider, choose flight source, and select an aircraft. The right-side field tools then show timing, feasibility, and stand guidance for that exact simulated moment.",
  },
  {
    question: "What does the long moon line on the map mean?",
    answer:
      "It is the moon azimuth from your observer point (compass direction to look). It updates with slider time, so when you scrub time, this line rotates to the moon direction for that instant.",
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
    question: "How do camera settings affect results?",
    answer:
      "Focal length and sensor crop define effective focal length. That value drives optical feasibility scoring and green/blue map filtering, so realistic camera settings are important.",
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

export default function AboutPage() {
  const [openIdx, setOpenIdx] = useState(0);
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
          <h2 className="px-3 pb-4 pt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Frequently asked questions
          </h2>
          <div className="divide-y divide-white/10">
            {faqs.map((item, idx) => (
              <section
                key={item.question}
                className={`rounded-2xl px-3 py-4 sm:px-4 ${
                  openIdx === idx ? "bg-white/[0.03]" : ""
                }`}
              >
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-start justify-between gap-4 text-left"
                  onClick={() => {
                    setOpenIdx((prev) => (prev === idx ? -1 : idx));
                  }}
                  aria-expanded={openIdx === idx}
                  aria-controls={`faq-answer-${idx}`}
                >
                  <span className="text-lg font-semibold leading-7 text-zinc-100 sm:text-xl">
                    {item.question}
                  </span>
                  <span
                    className={`mt-0.5 shrink-0 text-2xl leading-none transition ${
                      openIdx === idx ? "text-emerald-300" : "text-zinc-400"
                    }`}
                  >
                    {openIdx === idx ? "−" : "+"}
                  </span>
                </button>
                {openIdx === idx ? (
                  <p
                    id={`faq-answer-${idx}`}
                    className="mt-3 pr-8 text-base leading-relaxed text-zinc-300"
                  >
                    {item.answer}
                  </p>
                ) : null}
              </section>
            ))}
          </div>
          <section className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
              Pro Tip
            </h2>
            <p className="mt-2 text-base leading-relaxed text-zinc-200">
              Keep observer fixed first, then tune camera settings, and finally use
              corridor confidence + green-flight candidates together. That sequence
              gives the most reliable field decisions.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

