"use client";

import Link from "next/link";
import { appPath } from "@/lib/paths/appPath";

/** Gornja traka stranica Flight log i About (spec §2b.5, `pages-mockup-v1`). */
export function PageTopBar({
  current,
  children,
}: {
  current: "log" | "about";
  children?: React.ReactNode;
}) {
  const item =
    "inline-flex h-[38px] items-center gap-2 rounded-[var(--r-ctl)] px-3.5 text-[length:var(--fs-body)] transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)] max-md:px-2.5";
  const idle = `${item} font-medium text-[color:var(--ink-2)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[color:var(--panel)] [@media(hover:hover)_and_(pointer:fine)]:hover:text-[color:var(--ink)]`;
  const active = `${item} bg-[color:var(--ink)] font-bold text-[color:var(--ground)]`;
  return (
    <header
      className="z-20 flex h-14 shrink-0 items-center gap-4 border-b border-[color:var(--hair)] bg-[color:var(--ground)] px-4 max-md:sticky max-md:top-0 max-md:gap-2 max-md:px-3"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="LunaPic planner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={appPath("/logo.png")} alt="" width={26} height={26} decoding="async" className="h-[26px] w-auto object-contain" />
        <span className="mt-title text-[length:var(--fs-h2)] leading-none max-md:hidden">LunaPic</span>
      </Link>
      <nav aria-label="Pages" className="ml-6 flex gap-1 max-md:ml-0 max-md:flex-1">
        <Link href="/" className={idle}>
          <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Planner
        </Link>
        <Link href="/flight-log" className={current === "log" ? active : idle} aria-current={current === "log" ? "true" : undefined}>
          <span className="max-md:hidden">Flight log</span>
          <span className="md:hidden">Log</span>
        </Link>
        <Link href="/about" className={current === "about" ? active : idle} aria-current={current === "about" ? "true" : undefined}>
          About
        </Link>
      </nav>
      {children ? <div className="ml-auto max-md:hidden">{children}</div> : null}
    </header>
  );
}
